import { describe, it, expect, vi, afterEach } from 'vitest';
import { Component, Input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { RunView } from '@memberjunction/core';
import type { MJArtifactEntity, MJArtifactVersionEntity } from '@memberjunction/core-entities';
import { renderComponentFixture, query, text, capture } from '@memberjunction/ng-test-utils';
import { ArtifactMessageCardComponent } from './artifact-message-card.component';
import { ArtifactIconService } from '../services/artifact-icon.service';
import { ArtifactPreviewResolverService } from '../services/artifact-preview-resolver.service';

/**
 * DOM coverage for <mj-artifact-message-card> — the inline artifact chip/preview shown in a chat
 * message (~3×). Covers both passing `artifact` + `artifactVersion` directly and loading by
 * `artifactId` (`MJ: Artifacts` primary lookup with `MJ: Conversation Artifacts` fallback).
 */

@Component({ standalone: true, selector: 'stub-preview', template: '<div class="stub-preview-body"></div>' })
class StubPreview {
  @Input() artifactVersion: MJArtifactVersionEntity | undefined;
}

const ARTIFACT = Object.assign(Object.create(null) as MJArtifactEntity, {
  ID: 'a1',
  Name: 'Q3 Report',
  Type: 'Document',
  Description: 'desc',
});
const VERSION = Object.assign(Object.create(null) as MJArtifactVersionEntity, {
  VersionNumber: 2,
  Name: 'Q3 Report v2',
  MimeType: 'application/pdf',
});

interface Fakes {
  icon?: string;
  preview?: typeof StubPreview | null;
}

interface CardRenderInputs {
  artifact?: MJArtifactEntity;
  artifactVersion?: MJArtifactVersionEntity;
  artifactId?: string;
}

const render = (inputs: CardRenderInputs = {}, fakes: Fakes = {}) =>
  renderComponentFixture(ArtifactMessageCardComponent, {
    declarations: [ArtifactMessageCardComponent],
    imports: [StubPreview],
    providers: [
      { provide: ArtifactIconService, useValue: { getArtifactIcon: () => fakes.icon ?? 'fa-file-pdf' } },
      { provide: ArtifactPreviewResolverService, useValue: { resolvePreviewComponent: () => fakes.preview ?? null } },
    ],
    inputs: {
      artifact: 'artifact' in inputs ? inputs.artifact : ARTIFACT,
      artifactVersion: 'artifactVersion' in inputs ? inputs.artifactVersion : VERSION,
      ...(inputs.artifactId !== undefined ? { artifactId: inputs.artifactId } : {}),
    },
  });

afterEach(() => {
  vi.restoreAllMocks();
  TestBed.resetTestingModule();
});

describe('ArtifactMessageCardComponent (DOM)', () => {
  it('renders the info-bar box with the version display name, type badge and version number', () => {
    const f = render();
    expect(query(f, '.artifact-info-bar')).not.toBeNull();
    expect(text(f, '.artifact-info-bar .artifact-name')).toBe('Q3 Report v2');
    expect(text(f, '.artifact-type-badge')).toBe('Document');
    expect(text(f, '.artifact-version')).toBe('v2');
  });

  it('uses the icon from the icon service and the type badge colour for the artifact type', () => {
    const f = render({}, { icon: 'fa-file-invoice' });
    expect(query(f, '.artifact-info-bar .artifact-icon i')?.className).toContain('fa-file-invoice');
    // 'Document' → orange badge
    expect((query(f, '.artifact-type-badge') as HTMLElement).style.background).toContain('rgb(245, 158, 11)');
  });

  it('emits actionPerformed with the artifact + version when the info bar is clicked', () => {
    const f = render();
    const out = capture(f.componentInstance.actionPerformed);
    (query(f, '.artifact-info-bar') as HTMLElement).click();
    expect(out.length).toBe(1);
    expect(out[0].action).toBe('open');
    expect(out[0].artifact).toBe(ARTIFACT);
    expect(out[0].version).toBe(VERSION);
  });

  it('renders the error state when neither entities nor an artifactId are provided', () => {
    const f = render({ artifact: undefined, artifactVersion: undefined });
    expect(query(f, '.artifact-error')).not.toBeNull();
    expect(query(f, '.artifact-info-bar')).toBeNull();
  });

  it('renders the inline preview wrapper when the resolver returns a preview component', () => {
    const f = render({}, { preview: StubPreview });
    expect(query(f, '.artifact-preview-wrapper')).not.toBeNull();
    expect(query(f, '.stub-preview-body')).not.toBeNull();
    expect(query(f, '.artifact-info-bar')).toBeNull();
  });

  it('opens the full view from the preview wrapper click', () => {
    const f = render({}, { preview: StubPreview });
    const out = capture(f.componentInstance.actionPerformed);
    (query(f, '.artifact-preview-wrapper') as HTMLElement).click();
    expect(out.length).toBe(1);
    expect(out[0].action).toBe('open');
  });

  it('loads Library / Voice session artifacts from MJ: Artifacts first without falling back to MJ: Conversation Artifacts', async () => {
    const queriedEntities: string[] = [];
    const runViewMock = vi.fn(async (params: { EntityName: string }) => {
      queriedEntities.push(params.EntityName);
      if (params.EntityName === 'MJ: Artifacts') {
        return { Success: true, Results: [ARTIFACT] };
      }
      if (params.EntityName === 'MJ: Artifact Versions') {
        return { Success: true, Results: [VERSION] };
      }
      return { Success: true, Results: [] };
    });
    vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue(
      Object.assign(Object.create(RunView.prototype) as RunView, { RunView: runViewMock }),
    );

    const f = render({ artifact: undefined, artifactVersion: undefined, artifactId: 'a1' });
    for (let i = 0; i < 6; i++) {
      await Promise.resolve();
    }
    f.detectChanges();

    expect(queriedEntities).toEqual(['MJ: Artifacts', 'MJ: Artifact Versions']);
    expect(query(f, '.artifact-error')).toBeNull();
    expect(text(f, '.artifact-info-bar .artifact-name')).toBe('Q3 Report v2');
  });

  it('falls back to MJ: Conversation Artifacts when MJ: Artifacts returns 0 rows', async () => {
    const queriedEntities: string[] = [];
    const legacyArtifact = Object.assign(Object.create(null) as MJArtifactEntity, {
      ID: 'legacy-1',
      Name: 'Legacy Conv Artifact',
      Type: 'JSON',
      Description: 'legacy',
    });
    const legacyVersion = Object.assign(Object.create(null) as MJArtifactVersionEntity, {
      VersionNumber: 1,
      Name: 'Legacy v1',
      MimeType: 'application/json',
    });
    const runViewMock = vi.fn(async (params: { EntityName: string }) => {
      queriedEntities.push(params.EntityName);
      if (params.EntityName === 'MJ: Conversation Artifacts') {
        return { Success: true, Results: [legacyArtifact] };
      }
      if (params.EntityName === 'MJ: Artifact Versions') {
        return { Success: true, Results: [legacyVersion] };
      }
      return { Success: true, Results: [] };
    });
    vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue(
      Object.assign(Object.create(RunView.prototype) as RunView, { RunView: runViewMock }),
    );

    const f = render({ artifact: undefined, artifactVersion: undefined, artifactId: 'legacy-1' });
    for (let i = 0; i < 6; i++) {
      await Promise.resolve();
    }
    f.detectChanges();

    expect(queriedEntities).toEqual(['MJ: Artifacts', 'MJ: Conversation Artifacts', 'MJ: Artifact Versions']);
    expect(query(f, '.artifact-error')).toBeNull();
    expect(text(f, '.artifact-info-bar .artifact-name')).toBe('Legacy v1');
  });

  it('renders error state when both MJ: Artifacts and MJ: Conversation Artifacts return 0 rows', async () => {
    const runViewMock = vi.fn(async () => ({ Success: true, Results: [] }));
    vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue(
      Object.assign(Object.create(RunView.prototype) as RunView, { RunView: runViewMock }),
    );

    const f = render({ artifact: undefined, artifactVersion: undefined, artifactId: 'missing-id' });
    for (let i = 0; i < 6; i++) {
      await Promise.resolve();
    }
    f.detectChanges();

    expect(query(f, '.artifact-error')).not.toBeNull();
    expect(text(f, '.artifact-error')).toContain('Failed to load artifact');
  });
});
