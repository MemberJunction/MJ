import { Component, Input } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { Observable } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ArtifactsModule } from '@memberjunction/ng-artifacts';
import { UserInfo, type IMetadataProvider } from '@memberjunction/core';
import { ArtifactWorkspaceEngine } from './artifact-workspace-engine';
import { RealtimeArtifactWorkspaceSurfaceComponent } from './realtime-artifact-workspace-surface.component';

/** Stands in for the real viewer panel, recording the inputs the surface passes it. */
@Component({ selector: 'mj-artifact-viewer-panel', standalone: true, template: '' })
class ArtifactViewerPanelStub {
  @Input() public artifactId = '';
  @Input() public versionNumber: number | undefined;
  @Input() public currentUser: UserInfo | null = null;
  @Input() public Provider: IMetadataProvider | null = null;
  @Input() public environmentId = '';
  @Input() public refreshTrigger: Observable<void> | undefined;
  @Input() public canEdit = false;
  @Input() public showHeader = true;
  @Input() public showTabs = true;
  @Input() public showSaveToCollection = true;
  @Input() public showCloseButton = true;
  @Input() public showMaximizeButton = true;
}

function setup(engine: ArtifactWorkspaceEngine | null, user: UserInfo | null = null): ComponentFixture<RealtimeArtifactWorkspaceSurfaceComponent> {
  TestBed.configureTestingModule({ imports: [RealtimeArtifactWorkspaceSurfaceComponent] });
  TestBed.overrideComponent(RealtimeArtifactWorkspaceSurfaceComponent, {
    remove: { imports: [ArtifactsModule] },
    add: { imports: [ArtifactViewerPanelStub] },
  });
  const fixture = TestBed.createComponent(RealtimeArtifactWorkspaceSurfaceComponent);
  fixture.componentInstance.AgentName = 'Sage';
  fixture.componentInstance.CurrentUser = user;
  fixture.componentInstance.EnvironmentID = 'env-1';
  fixture.componentRef.setInput('Engine', engine);
  fixture.detectChanges();
  return fixture;
}

function tabs(fixture: ComponentFixture<RealtimeArtifactWorkspaceSurfaceComponent>): HTMLButtonElement[] {
  return Array.from(fixture.nativeElement.querySelectorAll('[role="tab"]'));
}

describe('RealtimeArtifactWorkspaceSurfaceComponent', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('shows the empty state, naming the agent, when no artifact is open', () => {
    const fixture = setup(new ArtifactWorkspaceEngine());
    const root: HTMLElement = fixture.nativeElement;

    expect(root.querySelector('.aw-empty__title')?.textContent).toContain('No workspace document open');
    expect(root.querySelector('.aw-empty__hint')?.textContent).toContain('Sage can open or build');
    expect(tabs(fixture)).toHaveLength(0);
  });

  it('renders a tab per open artifact, with an icon per type and the active one selected', () => {
    const engine = new ArtifactWorkspaceEngine();
    engine.AddOrFocus({ ArtifactID: 'a-1', Name: 'Q3 plan', ArtifactTypeName: 'Document' });
    engine.AddOrFocus({ ArtifactID: 'a-2', Name: 'Budget', ArtifactTypeName: 'Spreadsheet', VersionNumber: 3 });
    const fixture = setup(engine);

    const [doc, sheet] = tabs(fixture);
    expect(doc.textContent).toContain('Q3 plan');
    expect(doc.querySelector('i')?.className).toContain('fa-file-lines');
    expect(sheet.textContent).toContain('Budget');
    expect(sheet.textContent).toContain('v3');
    expect(sheet.querySelector('i')?.className).toContain('fa-table');

    // The last one added is active: selected, focusable, and labels the visible pane.
    expect(sheet.getAttribute('aria-selected')).toBe('true');
    expect(sheet.getAttribute('tabindex')).toBe('0');
    expect(doc.getAttribute('aria-selected')).toBe('false');
    expect(doc.getAttribute('tabindex')).toBe('-1');
    const pane = fixture.nativeElement.querySelector('[role="tabpanel"]') as HTMLElement;
    expect(pane.getAttribute('aria-labelledby')).toBe(sheet.id);
    expect(fixture.componentInstance.GetActiveElement()).toBe(pane);
  });

  it('selecting a tab activates it in the engine and reports the user choice', () => {
    const engine = new ArtifactWorkspaceEngine();
    const first = engine.AddOrFocus({ ArtifactID: 'a-1', Name: 'Q3 plan' });
    engine.AddOrFocus({ ArtifactID: 'a-2', Name: 'Budget' });
    const fixture = setup(engine);
    const onSelected = vi.fn();
    fixture.componentInstance.OnUserSelected = onSelected;

    tabs(fixture)[0].click();
    fixture.detectChanges();

    expect(engine.ActiveID).toBe(first.InstanceID);
    expect(onSelected).toHaveBeenCalledWith(first.InstanceID);
    expect(tabs(fixture)[0].getAttribute('aria-selected')).toBe('true');
  });

  it('the close button removes the active artifact and reports it', () => {
    const engine = new ArtifactWorkspaceEngine();
    engine.AddOrFocus({ ArtifactID: 'a-1', Name: 'Q3 plan' });
    const active = engine.AddOrFocus({ ArtifactID: 'a-2', Name: 'Budget' });
    const fixture = setup(engine);
    const onClosed = vi.fn();
    fixture.componentInstance.OnUserClosed = onClosed;

    const close = fixture.nativeElement.querySelector('.aw-close') as HTMLButtonElement;
    expect(close.getAttribute('aria-label')).toBe('Close Budget');
    close.click();
    fixture.detectChanges();

    expect(onClosed).toHaveBeenCalledWith(active.InstanceID);
    expect(engine.Get(active.InstanceID)).toBeUndefined();
    expect(tabs(fixture).map((t) => t.textContent?.trim())).toEqual(['Q3 plan']);
  });

  it('follows engine changes made after it renders', () => {
    const engine = new ArtifactWorkspaceEngine();
    const fixture = setup(engine);
    expect(tabs(fixture)).toHaveLength(0);

    engine.AddOrFocus({ ArtifactID: 'a-1', Name: 'Live doc' });
    fixture.detectChanges();

    expect(tabs(fixture)).toHaveLength(1);
    expect(tabs(fixture)[0].textContent).toContain('Live doc');
  });

  it('mounts the viewer panel only with a current user, passing the active artifact', () => {
    const engine = new ArtifactWorkspaceEngine();
    engine.AddOrFocus({ ArtifactID: 'a-9', Name: 'Deck', VersionNumber: 2, CanEdit: true });

    const withoutUser = setup(engine);
    expect(withoutUser.nativeElement.querySelector('mj-artifact-viewer-panel')).toBeNull();
    TestBed.resetTestingModule();

    const user = new UserInfo(undefined, { ID: 'u-1', Name: 'Pat' });
    expect(user.Name).toBe('Pat');
    const fixture = setup(engine, user);
    const panelEl = fixture.debugElement.query((d) => d.componentInstance instanceof ArtifactViewerPanelStub);
    const panel = panelEl.componentInstance as ArtifactViewerPanelStub;
    expect(panel.artifactId).toBe('a-9');
    expect(panel.versionNumber).toBe(2);
    expect(panel.currentUser).toBe(user);
    expect(panel.environmentId).toBe('env-1');
    expect(panel.canEdit).toBe(true);
    expect(panel.showHeader).toBe(false);
    expect(panel.showTabs).toBe(false);
  });

  it('clears its tabs when the engine is removed', () => {
    const engine = new ArtifactWorkspaceEngine();
    engine.AddOrFocus({ ArtifactID: 'a-1', Name: 'Q3 plan' });
    const fixture = setup(engine);
    expect(tabs(fixture)).toHaveLength(1);

    fixture.componentRef.setInput('Engine', null);
    fixture.detectChanges();

    expect(tabs(fixture)).toHaveLength(0);
    expect(fixture.nativeElement.querySelector('.aw-empty')).not.toBeNull();
  });
});
