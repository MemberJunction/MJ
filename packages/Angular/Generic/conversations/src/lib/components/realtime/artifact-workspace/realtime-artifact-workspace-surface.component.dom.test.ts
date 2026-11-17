import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { ArtifactVersionSavedEvent } from '@memberjunction/ng-artifacts';
import type { RealtimeChannelEvent } from '@memberjunction/realtime-runtime';
import { renderComponentFixture, query, queryAll, text, click } from '@memberjunction/ng-test-utils';
import { RealtimeArtifactWorkspaceSurfaceComponent } from './realtime-artifact-workspace-surface.component';
import { ArtifactWorkspaceChannel } from './artifact-workspace-channel';
import { ArtifactWorkspaceEngine } from './artifact-workspace-engine';
import type {
  ArtifactSelectionAnchor,
  ArtifactViewerNavigationAnchor,
  ArtifactWorkspaceViewMode,
} from './artifact-workspace-types';
import { MakeContext, type ChannelLog } from '../../../../__tests__/helpers/interactive-component-fixtures';

@Component({
  selector: 'mj-artifact-viewer-panel',
  standalone: true,
  template: `
    <div
      class="stub-viewer-panel"
      [attr.data-artifact-id]="artifactId"
      [attr.data-version-number]="versionNumber ?? ''"
      [attr.data-view-mode]="viewMode"
      [attr.data-nav-sheet]="navigationAnchor?.Sheet ?? ''"
      [attr.data-nav-range]="navigationAnchor?.Range ?? ''"
      [attr.data-nav-slide]="navigationAnchor?.SlideNumber ?? ''"
      [attr.data-nav-heading]="navigationAnchor?.Heading ?? ''"
    >
      <input class="stub-unsaved-draft" />
    </div>
  `,
})
class StubArtifactViewerPanelComponent {
  @Input() public artifactId = '';
  @Input() public versionNumber: number | undefined = undefined;
  @Input() public currentUser: UserInfo | null = null;
  @Input() public Provider: IMetadataProvider | null = null;
  @Input() public environmentId = '';
  @Input() public refreshTrigger: Subject<void> | undefined = undefined;
  @Input() public canEdit = false;
  @Input() public viewMode: ArtifactWorkspaceViewMode = 'edit';
  @Input() public navigationAnchor: ArtifactViewerNavigationAnchor | null = null;
  @Input() public showHeader = true;
  @Input() public showTabs = true;
  @Input() public showSaveToCollection = true;
  @Input() public showCloseButton = true;
  @Input() public showMaximizeButton = true;
  @Output() public VersionSaved = new EventEmitter<ArtifactVersionSavedEvent>();
  @Output() public selectionChanged = new EventEmitter<ArtifactSelectionAnchor>();
}

const TEST_USER = { ID: 'u-1', Name: 'Tester', Email: 't@example.org' } as UserInfo;

describe('RealtimeArtifactWorkspaceSurfaceComponent (DOM)', () => {
  let engine: ArtifactWorkspaceEngine;

  beforeEach(() => {
    engine = new ArtifactWorkspaceEngine();
    TestBed.overrideComponent(RealtimeArtifactWorkspaceSurfaceComponent, {
      set: { imports: [StubArtifactViewerPanelComponent] },
    });
  });

  const renderSurface = () =>
    renderComponentFixture(RealtimeArtifactWorkspaceSurfaceComponent, {
      providers: [],
      setup: (instance) => {
        instance.AgentName = 'Aria';
        instance.CurrentUser = TEST_USER;
        instance.EnvironmentID = 'env-1';
        instance.Engine = engine;
      },
    });

  it('shows empty state naming agent when no workspace document is open', () => {
    const f = renderSurface();
    expect(text(f, '.aw-empty__title')).toBe('No workspace document open');
    expect(text(f, '.aw-empty__hint')).toContain('Aria');
    expect(query(f, '.aw-tabs')).toBeNull();
  });

  it('keeps open workspace tabs mounted via [hidden] so switching tabs preserves DOM and viewer state', () => {
    const doc = engine.AddOrFocus({
      ArtifactID: 'art-doc',
      ArtifactVersionID: 'ver-doc-1',
      VersionNumber: 1,
      Name: 'Q4 Memo',
      ArtifactTypeName: 'Markdown Document',
      CanEdit: true,
    });
    const sheet = engine.AddOrFocus({
      ArtifactID: 'art-sheet',
      ArtifactVersionID: 'ver-sheet-1',
      VersionNumber: 2,
      Name: 'Forecast',
      ArtifactTypeName: 'Excel Spreadsheet',
      CanEdit: true,
    });
    engine.SetActive(doc.InstanceID);

    const f = renderSurface();
    const panes = queryAll(f, '[role="tabpanel"]');
    expect(panes).toHaveLength(2);
    expect(panes.map((p) => p.hasAttribute('hidden'))).toEqual([false, true]);
    expect(queryAll(f, 'mj-artifact-viewer-panel')).toHaveLength(2);

    // Mutate DOM inside the first viewer panel to simulate unsaved editor state
    const firstInput = panes[0].querySelector<HTMLInputElement>('.stub-unsaved-draft');
    expect(firstInput).not.toBeNull();
    firstInput!.value = 'unsaved-draft-state';

    // Switch to second tab and back: element identity and unsaved DOM state stay intact
    click(f, `[role="tab"][data-instance="${sheet.InstanceID}"]`);
    f.detectChanges();
    expect(engine.ActiveID).toBe(sheet.InstanceID);
    const panesAfterSwitch = queryAll(f, '[role="tabpanel"]');
    expect(panesAfterSwitch[0]).toBe(panes[0]);
    expect(panesAfterSwitch.map((p) => p.hasAttribute('hidden'))).toEqual([true, false]);

    click(f, `[role="tab"][data-instance="${doc.InstanceID}"]`);
    f.detectChanges();
    expect(engine.ActiveID).toBe(doc.InstanceID);
    expect(
      query(f, `[role="tabpanel"][data-instance="${doc.InstanceID}"] .stub-unsaved-draft`)?.getAttribute('value') ??
        (query(f, `[role="tabpanel"][data-instance="${doc.InstanceID}"] .stub-unsaved-draft`) as HTMLInputElement | null)?.value,
    ).toBe('unsaved-draft-state');
  });

  it('updates tab VersionNumber badge when child viewer emits VersionSaved (P0-22)', () => {
    const doc = engine.AddOrFocus({
      ArtifactID: 'art-doc',
      ArtifactVersionID: 'ver-doc-1',
      VersionNumber: 1,
      Name: 'Spec Doc',
      ArtifactTypeName: 'Markdown Document',
      CanEdit: true,
    });

    const f = renderSurface();
    expect(text(f, `[role="tab"][data-instance="${doc.InstanceID}"] .aw-tab__version`)).toBe('v1');

    const viewerDebug = f.debugElement.query((d) => d.componentInstance instanceof StubArtifactViewerPanelComponent);
    expect(viewerDebug).not.toBeNull();
    const viewer = viewerDebug.componentInstance as StubArtifactViewerPanelComponent;

    const savedHandler = vi.fn();
    f.componentInstance.OnUserVersionSaved = savedHandler;

    viewer.VersionSaved.emit({
      ArtifactID: 'art-doc',
      VersionID: 'ver-doc-2',
      VersionNumber: 2,
      UpdatedAt: new Date(),
    });
    f.detectChanges();

    expect(text(f, `[role="tab"][data-instance="${doc.InstanceID}"] .aw-tab__version`)).toBe('v2');
    expect(engine.Instances[0].ArtifactVersionID).toBe('ver-doc-2');
    expect(savedHandler).toHaveBeenCalledWith(
      doc.InstanceID,
      expect.objectContaining({ VersionID: 'ver-doc-2', VersionNumber: 2 }),
    );
  });

  it('wires ArtifactWorkspaceChannel <-> <mj-artifact-viewer-panel> bidirectionally for viewMode, navigationAnchor, and selectionChanged (NW-6)', async () => {
    const channel = new ArtifactWorkspaceChannel();
    const log: ChannelLog = { Notes: [] };
    await channel.Initialize(MakeContext(log));

    const sheet = channel.Engine.AddOrFocus({
      ArtifactID: '11111111-1111-4111-8111-111111111111',
      ArtifactVersionID: '22222222-2222-4222-8222-222222222222',
      VersionNumber: 1,
      Name: 'Board Forecast',
      ArtifactTypeName: 'Excel Spreadsheet',
      CanEdit: true,
    });

    const f = renderComponentFixture(RealtimeArtifactWorkspaceSurfaceComponent, {
      providers: [],
      setup: (instance) => {
        channel.BindSurface(instance);
        instance.CurrentUser = TEST_USER;
      },
    });

    const pane = query(f, `[role="tabpanel"][data-instance="${sheet.InstanceID}"]`);
    expect(pane).not.toBeNull();
    // Passive DOM-attribute facade must not exist on .aw-pane
    expect(pane?.hasAttribute('data-view-mode')).toBe(false);
    expect(pane?.hasAttribute('data-anchor-sheet')).toBe(false);
    expect(pane?.hasAttribute('data-anchor-range')).toBe(false);

    const viewerDebug = f.debugElement.query((d) => d.componentInstance instanceof StubArtifactViewerPanelComponent);
    expect(viewerDebug).not.toBeNull();
    const viewer = viewerDebug.componentInstance as StubArtifactViewerPanelComponent;

    // 1. Agent verb set_view_mode drives <mj-artifact-viewer-panel> [viewMode]
    const modeRes = await channel.ApplyVerb('set_view_mode', { mode: 'suggest' }, 'agent', sheet.InstanceID);
    expect(modeRes.Success).toBe(true);
    f.detectChanges();
    expect(viewer.viewMode).toBe('suggest');
    expect(query(f, '.stub-viewer-panel')?.getAttribute('data-view-mode')).toBe('suggest');

    // 2. Agent verb navigate_to_anchor drives <mj-artifact-viewer-panel> [navigationAnchor]
    const navRes = await channel.ApplyVerb(
      'navigate_to_anchor',
      { sheet: 'Revenue', range: 'B2:D12', highlightMs: 5000 },
      'agent',
      sheet.InstanceID,
    );
    expect(navRes.Success).toBe(true);
    f.detectChanges();
    expect(viewer.navigationAnchor).toEqual({
      Sheet: 'Revenue',
      Range: 'B2:D12',
      HighlightMs: 5000,
    });
    expect(query(f, '.stub-viewer-panel')?.getAttribute('data-nav-sheet')).toBe('Revenue');
    expect(query(f, '.stub-viewer-panel')?.getAttribute('data-nav-range')).toBe('B2:D12');

    // 3. Viewer (selectionChanged) flows through surface ReportSelectionAnchor -> OnUserSelectionChanged -> channel selection_changed event
    const events: Array<{ Name: string; Payload: RealtimeChannelEvent['Payload'] }> = [];
    const sub = channel.Events$.subscribe((ev) => {
      events.push({ Name: ev.Name, Payload: ev.Payload });
    });
    try {
      viewer.selectionChanged.emit({
        domain: 'spreadsheet',
        sheet: 'Q4',
        range: 'E10:F15',
      });
      f.detectChanges();

      expect(channel.Engine.Get(sheet.InstanceID)?.Selection).toEqual({
        domain: 'spreadsheet',
        sheet: 'Q4',
        range: 'E10:F15',
      });
      const selEv = events.find((e) => e.Name === 'selection_changed');
      expect(selEv).toBeDefined();
      expect(selEv?.Payload).toMatchObject({
        instanceId: sheet.InstanceID,
        artifactId: sheet.ArtifactID,
        artifactTypeName: 'Excel Spreadsheet',
        anchor: { domain: 'spreadsheet', sheet: 'Q4', range: 'E10:F15' },
      });
      expect(channel.GetState()['activeSelection']).toMatchObject({
        instanceId: sheet.InstanceID,
        artifactId: sheet.ArtifactID,
        anchor: { domain: 'spreadsheet', sheet: 'Q4', range: 'E10:F15' },
      });
    } finally {
      sub.unsubscribe();
      channel.Dispose();
    }
  });
});
