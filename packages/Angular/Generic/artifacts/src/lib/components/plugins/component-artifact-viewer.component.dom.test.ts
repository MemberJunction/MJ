import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { MJArtifactVersionEntity } from '@memberjunction/core-entities';
import { type IMetadataProvider } from '@memberjunction/core';
import { AngularAdapterService } from '@memberjunction/ng-react';
import { renderComponentFixture, query, text } from '@memberjunction/ng-test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ComponentArtifactViewerComponent } from './component-artifact-viewer.component';

@Component({ standalone: false, selector: 'mj-react-component', template: '<div class="stub-react-component"></div>' })
class ReactComponentStub {
  @Input() public component: object | null = null;
  @Input() public componentProps: object | null = null;
  @Output() public componentEvent = new EventEmitter<object>();
  @Output() public openEntityRecord = new EventEmitter<object>();
  @Output() public initialized = new EventEmitter<void>();
}

@Component({ standalone: false, selector: 'mj-interactive-form', template: '<div class="stub-interactive-form"></div>' })
class InteractiveFormStub {
  @Input() public componentSpec: object | null = null;
  @Input() public record: object | null = null;
}

@Component({ standalone: false, selector: 'mj-loading', template: '' })
class LoadingStub {
  @Input() public text = '';
  @Input() public size = 'medium';
}

@Component({ standalone: false, selector: 'mj-component-feedback-panel', template: '' })
class FeedbackPanelStub {
  @Input() public ComponentSpec: object | null = null;
  @Input() public ReactContainerElement: HTMLElement | null = null;
  @Output() public Closed = new EventEmitter<void>();
}

function makeComponentArtifactVersion(
  content: string,
  author: { UserID: string | null; User: string | null } = { UserID: null, User: null },
): MJArtifactVersionEntity {
  const ver = Object.create(MJArtifactVersionEntity.prototype) as MJArtifactVersionEntity;
  Object.defineProperties(ver, {
    ID: { value: 'ver-comp-1', configurable: true, enumerable: true },
    ArtifactID: { value: '', configurable: true, enumerable: true },
    VersionNumber: { value: 1, configurable: true, enumerable: true },
    Content: { value: content, configurable: true, enumerable: true },
    Configuration: { value: '{}', configurable: true, enumerable: true },
    UserID: { value: author.UserID, configurable: true, enumerable: true },
    User: { value: author.User, configurable: true, enumerable: true },
  });
  return ver;
}

const VIEWER_DECLARATIONS = [
  ComponentArtifactViewerComponent,
  ReactComponentStub,
  InteractiveFormStub,
  LoadingStub,
  FeedbackPanelStub,
];

const CURRENT_USER_ID = 'B1A2C3D4-0000-0000-0000-000000000001';
const OTHER_USER_ID = 'B1A2C3D4-0000-0000-0000-000000000002';

function renderViewerForAuthor(author: { UserID: string | null; User: string | null }) {
  const mockAdapter = { initialize: vi.fn(async () => undefined), isInitialized: vi.fn(() => false) };
  const spec = JSON.stringify({ name: 'SharedWidget', code: 'function SharedWidget() { return null; }' });
  const provider = { CurrentUser: { ID: CURRENT_USER_ID, Name: 'Viewer', Email: 'viewer@example.com' } } as IMetadataProvider;
  const fixture = renderComponentFixture(ComponentArtifactViewerComponent, {
    imports: [CommonModule, FormsModule],
    declarations: VIEWER_DECLARATIONS,
    providers: [{ provide: AngularAdapterService, useValue: mockAdapter }],
    inputs: { Provider: provider, artifactVersion: makeComponentArtifactVersion(spec, author) },
  });
  fixture.detectChanges();
  return fixture;
}

describe('ComponentArtifactViewerComponent code written by a different user', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('does not run the code until the viewer agrees, and names the author', () => {
    const fixture = renderViewerForAuthor({ UserID: OTHER_USER_ID, User: 'Alice Author' });

    expect(query(fixture, '.stub-react-component')).toBeNull();
    expect(text(fixture, '.run-consent')).toContain('Alice Author');

    (query(fixture, '.run-consent button') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(query(fixture, '.stub-react-component')).not.toBeNull();
  });

  it('does not run the code when the author is not known', () => {
    const fixture = renderViewerForAuthor({ UserID: null, User: null });

    expect(query(fixture, '.stub-react-component')).toBeNull();
    expect(query(fixture, '.run-consent')).not.toBeNull();
  });
});

describe('ComponentArtifactViewerComponent guest snapshot fail-closed security', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('fails closed in GuestSnapshotMode and never initializes dynamic React execution', () => {
    const mockAdapter = {
      initialize: vi.fn(async () => undefined),
      isInitialized: vi.fn(() => false),
    };
    const executableSpec = JSON.stringify({
      name: 'EvilGuestWidget',
      code: 'export default function EvilGuestWidget() { return null; }',
    });

    const fixture = renderComponentFixture(ComponentArtifactViewerComponent, {
      imports: [CommonModule, FormsModule],
      declarations: [
        ComponentArtifactViewerComponent,
        ReactComponentStub,
        InteractiveFormStub,
        LoadingStub,
        FeedbackPanelStub,
      ],
      providers: [{ provide: AngularAdapterService, useValue: mockAdapter }],
      inputs: {
        GuestSnapshotMode: true,
        artifactVersion: makeComponentArtifactVersion(executableSpec),
      },
    });
    fixture.detectChanges();

    expect(fixture.componentInstance.HasError).toBe(true);
    expect(fixture.componentInstance.Component).toBeNull();
    expect(fixture.componentInstance.hasDisplayContent).toBe(false);
    expect(fixture.componentInstance.errorMessage).toContain('Disabled in Guest Mode');
    expect(mockAdapter.initialize).not.toHaveBeenCalled();
    expect(query(fixture, '.stub-react-component')).toBeNull();
    expect(text(fixture, '.error-state')).toContain('Disabled in Guest Mode');
  });

  it('clears executable component spec immediately when GuestSnapshotMode toggles to true', () => {
    const mockAdapter = {
      initialize: vi.fn(async () => undefined),
      isInitialized: vi.fn(() => false),
    };
    const executableSpec = JSON.stringify({
      name: 'NormalWidget',
      code: 'export default function NormalWidget() { return null; }',
    });

    const mockProvider = {
      CurrentUser: { ID: 'user-1', Name: 'Test User', Email: 'test@example.com' },
    } as IMetadataProvider;

    const fixture = renderComponentFixture(ComponentArtifactViewerComponent, {
      imports: [CommonModule, FormsModule],
      declarations: [
        ComponentArtifactViewerComponent,
        ReactComponentStub,
        InteractiveFormStub,
        LoadingStub,
        FeedbackPanelStub,
      ],
      providers: [{ provide: AngularAdapterService, useValue: mockAdapter }],
      inputs: {
        GuestSnapshotMode: false,
        Provider: mockProvider,
        artifactVersion: makeComponentArtifactVersion(executableSpec, { UserID: 'user-1', User: 'Test User' }),
      },
    });
    fixture.detectChanges();
    expect(fixture.componentInstance.Component).not.toBeNull();
    expect(query(fixture, '.stub-react-component')).not.toBeNull();

    fixture.componentRef.setInput('GuestSnapshotMode', true);
    fixture.detectChanges();

    expect(fixture.componentInstance.HasError).toBe(true);
    expect(fixture.componentInstance.Component).toBeNull();
    expect(fixture.componentInstance.hasDisplayContent).toBe(false);
    expect(query(fixture, '.stub-react-component')).toBeNull();
  });
});
