import { describe, it, expect, vi, afterEach } from 'vitest';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { renderComponentFixture, query, text, capture } from '@memberjunction/ng-test-utils';
import { ArtifactTypePluginViewerComponent } from './artifact-type-plugin-viewer.component';

afterEach(() => {
  vi.restoreAllMocks();
  TestBed.resetTestingModule();
});

describe('ArtifactTypePluginViewerComponent DOM', () => {
  it('renders loading spinner state when isLoading is true', () => {
    vi.spyOn(ArtifactTypePluginViewerComponent.prototype, 'ngOnInit').mockImplementation(() => {});
    const f = renderComponentFixture(ArtifactTypePluginViewerComponent, {
      declarations: [ArtifactTypePluginViewerComponent],
      schemas: [NO_ERRORS_SCHEMA],
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
      schemas: [NO_ERRORS_SCHEMA],
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
      schemas: [NO_ERRORS_SCHEMA],
    });
    f.detectChanges();
    const committed = capture(f.componentInstance.ContentCommitted);
    const opened = capture(f.componentInstance.openEntityRecord);
    const nav = capture(f.componentInstance.navigationRequest);
    const loaded = capture(f.componentInstance.pluginLoaded);
    const tabs = capture(f.componentInstance.tabsChanged);
    f.componentInstance.ContentCommitted.emit('updated');
    f.componentInstance.openEntityRecord.emit({ entityName: 'Accounts', compositeKey: undefined as never });
    f.componentInstance.navigationRequest.emit({ appName: 'Chat' });
    f.componentInstance.pluginLoaded.emit(null as never);
    f.componentInstance.tabsChanged.emit([]);
    expect(committed).toEqual(['updated']);
    expect(opened.length).toBe(1);
    expect(nav.length).toBe(1);
    expect(loaded.length).toBe(1);
    expect(tabs.length).toBe(1);
  });
});
