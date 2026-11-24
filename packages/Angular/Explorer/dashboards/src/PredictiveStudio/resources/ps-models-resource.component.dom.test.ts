import '@angular/compiler';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { UserInfoEngine } from '@memberjunction/core-entities';
import { PSModelsResourceComponent } from './ps-models-resource.component';
import { PSResourceBase } from './ps-resource-base';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {
  // already initialized
}

afterEach(() => vi.restoreAllMocks());

const A = '7E700000-0000-4000-8000-0000000000A2';
const B = '7CCC6DD8-B9D2-49C9-8A22-4BB2842B1458';

/**
 * A Models tab restored from the user's saved workspace carries the query params it was saved with (model A). A deep
 * link to model B updates the tab's params, and `BaseResourceComponent.ngOnInit` replays them through
 * `OnQueryParamsChanged` while it subscribes. The resource is built without its template; the base `ngOnInit` is
 * replaced by that replay so the order of the two reads is what the test controls (OF4-50).
 */
function RestoredResource(saved: Record<string, string>, delivered: Record<string, string> | null): PSModelsResourceComponent {
  vi.spyOn(UserInfoEngine.Instance, 'GetSetting').mockReturnValue(undefined);
  vi.spyOn(PSResourceBase.prototype, 'ngOnInit').mockImplementation(function (this: PSModelsResourceComponent): void {
    if (delivered) void this['OnQueryParamsChanged'](delivered, 'deeplink');
  });
  return Object.assign(Object.create(PSModelsResourceComponent.prototype), {
    Data: { Configuration: { queryParams: saved } },
    engine: { Models: [{ ID: A }, { ID: B }] },
    cdrLocal: { detectChanges: (): void => undefined },
    Sections: [],
  });
}

describe('PSModelsResourceComponent — the model a deep link names (OF4-50)', () => {
  it('a deep link delivered while the restored tab initialises wins over the params the tab was saved with', () => {
    const resource = RestoredResource({ section: 'registry', modelId: A }, { section: 'registry', modelId: B });
    resource.ngOnInit();
    expect(resource.initialModelId).toBe(B);
  });

  it('with no delivery, the tab opens on the model its saved params name', () => {
    const resource = RestoredResource({ section: 'registry', modelId: A }, null);
    resource.ngOnInit();
    expect(resource.initialModelId).toBe(A);
  });
});
