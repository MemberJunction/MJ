import { describe, it, expect, vi, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { CompositeKey } from '@memberjunction/core';
import { renderComponentFixture, query, text, capture } from '@memberjunction/ng-test-utils';
import { ArtifactTypePluginViewerComponent } from './artifact-type-plugin-viewer.component';
import { BaseArtifactViewerPluginComponent } from './base-artifact-viewer.component';

afterEach(() => {
  vi.restoreAllMocks();
  TestBed.resetTestingModule();
});

describe('ArtifactTypePluginViewerComponent DOM', () => {
  it('renders loading spinner state when isLoading is true', () => {
    vi.spyOn(ArtifactTypePluginViewerComponent.prototype, 'ngOnInit').mockImplementation(() => {});
    const f = renderComponentFixture(ArtifactTypePluginViewerComponent, {
      declarations: [ArtifactTypePluginViewerComponent],
      setup: (inst) => {
        inst.isLoading = true;
      },
    });
    f.detectChanges();
    expect(query(f, '.loading-state')).not.toBeNull();
    expect(text(f, '.loading-state')).toContain('Loading artifact viewer');
  });

  it('renders error title and technical details when error state is populated', () => {
    vi.spyOn(ArtifactTypePluginViewerComponent.prototype, 'ngOnInit').mockImplementation(() => {});
    const f = renderComponentFixture(ArtifactTypePluginViewerComponent, {
      declarations: [ArtifactTypePluginViewerComponent],
      setup: (inst) => {
        inst.isLoading = false;
        inst.errorTitle = 'Plugin Missing';
        inst.error = 'DriverClass could not be resolved.';
        inst.errorDetails = 'ClassFactory returned null';
      },
    });
    f.detectChanges();
    expect(text(f, '.error-title')).toContain('Plugin Missing');
    expect(text(f, '.error-details')).toContain('DriverClass could not be resolved.');
    expect(text(f, '.error-tech-details')).toContain('ClassFactory returned null');
  });

  it('exposes ContentCommitted, openEntityRecord, navigationRequest, pluginLoaded, and tabsChanged outputs', () => {
    vi.spyOn(ArtifactTypePluginViewerComponent.prototype, 'ngOnInit').mockImplementation(() => {});
    const f = renderComponentFixture(ArtifactTypePluginViewerComponent, {
      declarations: [ArtifactTypePluginViewerComponent],
    });
    f.detectChanges();
    const committed = capture(f.componentInstance.ContentCommitted);
    const opened = capture(f.componentInstance.openEntityRecord);
    const nav = capture(f.componentInstance.navigationRequest);
    const loaded = capture(f.componentInstance.pluginLoaded);
    const tabs = capture(f.componentInstance.tabsChanged);
    const pluginDouble = {
      isLoading: false,
      hasDisplayContent: true,
    } satisfies Pick<BaseArtifactViewerPluginComponent, 'isLoading' | 'hasDisplayContent'>;
    f.componentInstance.ContentCommitted.emit('updated');
    f.componentInstance.openEntityRecord.emit({
      entityName: 'Accounts',
      compositeKey: new CompositeKey([{ FieldName: 'ID', Value: 'acc-1' }]),
    });
    f.componentInstance.navigationRequest.emit({ appName: 'Chat' });
    f.componentInstance.pluginLoaded.emit(pluginDouble as unknown as BaseArtifactViewerPluginComponent);
    f.componentInstance.tabsChanged.emit([]);
    expect(committed).toEqual(['updated']);
    expect(opened.length).toBe(1);
    expect(nav.length).toBe(1);
    expect(loaded.length).toBe(1);
    expect(tabs.length).toBe(1);
  });
});
