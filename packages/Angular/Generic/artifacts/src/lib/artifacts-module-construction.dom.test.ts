import { describe, it, expect, vi, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { AngularAdapterService } from '@memberjunction/ng-react';
import { ArtifactsModule } from './artifacts.module';

describe('ArtifactsModule construction (#4802)', () => {
  afterEach(() => { vi.restoreAllMocks(); TestBed.resetTestingModule(); });

  it('does not start loading the React runtime from a CDN when the module is constructed', () => {
    // preload() is the sole entry that injects CDN hints (via LibraryLoader) and kicks off initialize().
    const preload = vi.spyOn(AngularAdapterService.prototype, 'preload');
    const initialize = vi.spyOn(AngularAdapterService.prototype, 'initialize');

    TestBed.configureTestingModule({ imports: [ArtifactsModule] });
    // Resolving the injector constructs every imported NgModule eagerly, exactly
    // as importProvidersFrom/createApplication does at a host app's bootstrap.
    const module = TestBed.inject(ArtifactsModule);

    expect(module).toBeInstanceOf(ArtifactsModule);
    expect(preload).not.toHaveBeenCalled();
    expect(initialize).not.toHaveBeenCalled();
    const cdnTags = document.head.querySelectorAll('link[href*="unpkg.com"], script[src*="unpkg.com"], link[href*="jsdelivr"], script[src*="jsdelivr"]');
    expect(cdnTags.length).toBe(0);
  });
});
