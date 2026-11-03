import '@angular/compiler';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { CreateFakeProvider } from '@memberjunction/ng-test-utils';
import { PSStudioResourceComponent } from './ps-studio-resource.component';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {
  // already initialized
}

afterEach(() => vi.restoreAllMocks());

/**
 * The Studio door's co-pilot agent lookup. The resource is built without its template (no layout, chat or panels):
 * only the provider and the change detector the lookup touches are set.
 */
describe('PSStudioResourceComponent — the co-pilot agent lookup', () => {
  it("loads the AI engine through the resource's provider", async () => {
    const provider = CreateFakeProvider({ entities: [] });
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const config = vi.spyOn(AIEngineBase.Instance, 'Config').mockResolvedValue(undefined);
    const resource: PSStudioResourceComponent = Object.assign(Object.create(PSStudioResourceComponent.prototype), {
      Provider: provider,
      cdrLocal: { detectChanges: (): void => undefined },
    });
    await resource['ensureModelDevAgentResolved']();
    expect(config.mock.calls.map((c) => c[2] === provider)).toEqual([true]);
    // the stubbed engine holds no agents, so the lookup logs that chat falls back to default routing
    expect(errors.mock.calls.map((c) => String(c[0]))).toEqual([expect.stringContaining("'Model Development Agent' not found")]);
  });
});
