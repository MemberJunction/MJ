import { Component, Inject, Optional } from '@angular/core';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { CompositeKey, type DataSnapshot } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import { MJArtifactVersionEntity } from '@memberjunction/core-entities';
import { renderComponentFixture, query, text, capture } from '@memberjunction/ng-test-utils';
import {
  ArtifactTypePluginViewerComponent,
  MJ_EMBEDDED_ARTIFACT_ANCESTORS,
  MJ_MAX_EMBED_DEPTH,
} from './artifact-type-plugin-viewer.component';
import { BaseArtifactViewerPluginComponent } from './base-artifact-viewer.component';

@Component({
  standalone: false,
  selector: 'mj-test-dummy-plugin',
  template: `<div class="dummy-plugin-version">{{ artifactVersion?.ID }}</div>`,
})
class DummyPluginComponent extends BaseArtifactViewerPluginComponent {
  public static InstanceCount = 0;
  public static DestroyCount = 0;
  public readonly InjectedAncestors: ReadonlySet<string> | null;

  constructor(
    @Optional()
    @Inject(MJ_EMBEDDED_ARTIFACT_ANCESTORS)
    ancestors: ReadonlySet<string> | null
  ) {
    super();
    this.InjectedAncestors = ancestors;
    DummyPluginComponent.InstanceCount++;
  }

  public GetCurrentStateSnapshot(): DataSnapshot | null {
    return null;
  }

  public ngOnDestroy(): void {
    DummyPluginComponent.DestroyCount++;
  }
}

afterEach(() => {
  vi.restoreAllMocks();
  TestBed.resetTestingModule();
});

describe('ArtifactTypePluginViewerComponent DOM', () => {
  it('renders loading spinner state when isLoading is true', () => {
    vi.spyOn(ArtifactTypePluginViewerComponent.prototype, 'ngOnInit').mockImplementation(async () => {});
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
    vi.spyOn(ArtifactTypePluginViewerComponent.prototype, 'ngOnInit').mockImplementation(async () => {});
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
    vi.spyOn(ArtifactTypePluginViewerComponent.prototype, 'ngOnInit').mockImplementation(async () => {});
    const f = renderComponentFixture(ArtifactTypePluginViewerComponent, {
      declarations: [ArtifactTypePluginViewerComponent],
    });
    f.detectChanges();
    const committed = capture(f.componentInstance.ContentCommitted);
    const opened = capture(f.componentInstance.openEntityRecord);
    const nav = capture(f.componentInstance.navigationRequest);
    const loaded = capture(f.componentInstance.pluginLoaded);
    const tabs = capture(f.componentInstance.tabsChanged);
    f.componentInstance.ContentCommitted.emit('updated');
    f.componentInstance.openEntityRecord.emit({
      entityName: 'Accounts',
      compositeKey: new CompositeKey([{ FieldName: 'ID', Value: 'acc-1' }]),
    });
    f.componentInstance.navigationRequest.emit({ appName: 'Chat', navItemName: 'Chats' });
    f.componentInstance.pluginLoaded.emit();
    f.componentInstance.tabsChanged.emit();
    expect(committed).toEqual(['updated']);
    expect(opened.length).toBe(1);
    expect(nav.length).toBe(1);
    expect(loaded.length).toBe(1);
    expect(tabs.length).toBe(1);
  });

  it('blocks circular OLE embeds when ArtifactID is already in MJ_EMBEDDED_ARTIFACT_ANCESTORS', async () => {
    const classSpy = vi.spyOn(MJGlobal.Instance.ClassFactory, 'GetRegistrationAsync');
    const f = renderComponentFixture(ArtifactTypePluginViewerComponent, {
      declarations: [ArtifactTypePluginViewerComponent],
      providers: [
        {
          provide: MJ_EMBEDDED_ARTIFACT_ANCESTORS,
          useValue: new Set(['art-loop-1']),
        },
      ],
      setup: (inst) => {
        inst.ArtifactTypeName = 'Markdown Document';
        inst.artifactVersion = {
          ID: 'ver-1',
          ArtifactID: 'ART-LOOP-1',
        } as MJArtifactVersionEntity;
      },
    });

    f.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 0));
    f.detectChanges();

    expect(text(f, '.error-title')).toContain('Circular Embed Blocked');
    expect(text(f, '.error-details')).toContain('embed loop');
    expect(classSpy).not.toHaveBeenCalled();
  });

  it('blocks embedded artifacts exceeding MJ_MAX_EMBED_DEPTH', async () => {
    const classSpy = vi.spyOn(MJGlobal.Instance.ClassFactory, 'GetRegistrationAsync');
    const deepAncestors = new Set<string>(['art-1', 'art-2', 'art-3']);
    expect(deepAncestors.size).toBe(MJ_MAX_EMBED_DEPTH);

    const f = renderComponentFixture(ArtifactTypePluginViewerComponent, {
      declarations: [ArtifactTypePluginViewerComponent],
      providers: [
        {
          provide: MJ_EMBEDDED_ARTIFACT_ANCESTORS,
          useValue: deepAncestors,
        },
      ],
      setup: (inst) => {
        inst.ArtifactTypeName = 'Markdown Document';
        inst.artifactVersion = {
          ID: 'ver-4',
          ArtifactID: 'art-4',
        } as MJArtifactVersionEntity;
      },
    });

    f.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 0));
    f.detectChanges();

    expect(text(f, '.error-title')).toContain('Maximum Embed Depth Exceeded');
    expect(classSpy).not.toHaveBeenCalled();
  });

  it('propagates child MJ_EMBEDDED_ARTIFACT_ANCESTORS and keeps plugin alive across version updates of same artifact', async () => {
    DummyPluginComponent.InstanceCount = 0;
    DummyPluginComponent.DestroyCount = 0;
    vi.spyOn(MJGlobal.Instance.ClassFactory, 'GetRegistrationAsync').mockResolvedValue({
      SubClass: DummyPluginComponent,
    } as ReturnType<typeof MJGlobal.Instance.ClassFactory.GetRegistrationAsync> extends Promise<infer R> ? R : never);

    const f = renderComponentFixture(ArtifactTypePluginViewerComponent, {
      declarations: [ArtifactTypePluginViewerComponent, DummyPluginComponent],
      setup: (inst) => {
        inst.ArtifactTypeName = 'Markdown Document';
        inst.artifactVersion = {
          ID: 'ver-1',
          ArtifactID: 'art-root',
        } as MJArtifactVersionEntity;
      },
    });

    f.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 0));
    f.detectChanges();

    const plugin = f.componentInstance.PluginInstance as DummyPluginComponent;
    expect(plugin).not.toBeNull();
    expect(plugin.InjectedAncestors?.has('art-root')).toBe(true);
    expect(DummyPluginComponent.InstanceCount).toBe(1);

    // Update version of the same artifact — must keep live instance instead of destroying it
    f.componentInstance.artifactVersion = {
      ID: 'ver-2',
      ArtifactID: 'art-root',
    } as MJArtifactVersionEntity;
    await new Promise((resolve) => setTimeout(resolve, 0));
    f.detectChanges();

    expect(DummyPluginComponent.InstanceCount).toBe(1);
    expect(DummyPluginComponent.DestroyCount).toBe(0);
    expect(text(f, '.dummy-plugin-version')).toContain('ver-2');
  });

  it('resolves plugin via explicit [DriverClass] without Provider/ArtifactTypeName and forwards NW-1 & NW-6 bindings', async () => {
    DummyPluginComponent.InstanceCount = 0;
    const classSpy = vi.spyOn(MJGlobal.Instance.ClassFactory, 'GetRegistrationAsync').mockResolvedValue({
      SubClass: DummyPluginComponent,
    } as ReturnType<typeof MJGlobal.Instance.ClassFactory.GetRegistrationAsync> extends Promise<infer R> ? R : never);

    const snapshotMap = {
      'blk-1': {
        Verified: true,
        FrozenByUserName: 'Alice Reviewer',
        FrozenAt: '2026-11-15T12:00:00.000Z',
      },
    };
    const anchor = { BlockID: 'blk-1' };

    const f = renderComponentFixture(ArtifactTypePluginViewerComponent, {
      declarations: [ArtifactTypePluginViewerComponent, DummyPluginComponent],
      inputs: {
        DriverClass: 'GuestDirectPlugin',
        ArtifactTypeName: '',
        Provider: null,
        artifactVersion: Object.assign(Object.create(null) as MJArtifactVersionEntity, {
          ID: 'ver-guest-1',
          ArtifactID: 'art-guest-1',
        }),
        PreVerifiedFrozenSnapshots: snapshotMap,
        ViewMode: 'suggest',
        NavigationAnchor: anchor,
      },
    });

    f.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 0));
    f.detectChanges();

    expect(classSpy).toHaveBeenCalledWith(BaseArtifactViewerPluginComponent, 'GuestDirectPlugin');
    const plugin = f.componentInstance.PluginInstance as DummyPluginComponent;
    expect(plugin).not.toBeNull();
    expect(plugin.PreVerifiedFrozenSnapshots).toEqual(snapshotMap);
    expect(plugin.SyncViewMode).toBe('suggest');
    expect(plugin.NavigationAnchor).toEqual(anchor);

    const emittedSelections = capture(f.componentInstance.SelectionChanged);
    plugin.SelectionChanged.emit({ domain: 'document', heading: 'Executive Summary' });
    expect(emittedSelections).toEqual([{ domain: 'document', heading: 'Executive Summary' }]);
  });
});
