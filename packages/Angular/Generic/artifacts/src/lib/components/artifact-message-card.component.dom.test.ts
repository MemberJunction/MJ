import { describe, it, expect } from 'vitest';
import { Component, Input } from '@angular/core';
import type { MJArtifactEntity, MJArtifactVersionEntity } from '@memberjunction/core-entities';
import { renderComponentFixture, query, text, capture } from '@memberjunction/ng-test-utils';
import { ArtifactMessageCardComponent } from './artifact-message-card.component';
import { ArtifactIconService } from '../services/artifact-icon.service';
import { ArtifactPreviewResolverService } from '../services/artifact-preview-resolver.service';

/**
 * DOM coverage for <mj-artifact-message-card> — the inline artifact chip/preview shown in a chat
 * message (~3×). Passing `artifact` + `artifactVersion` skips its RunView load path; the two injected
 * services (icon + preview-resolver) are faked. Covers the info-bar box (name / type badge + colour /
 * version / icon), the open → actionPerformed emit, the error branch (no id, no entities), and the
 * inline-preview branch when the resolver returns a preview component.
 */

@Component({ standalone: true, selector: 'stub-preview', template: '<div class="stub-preview-body"></div>' })
class StubPreview {
  @Input() artifactVersion: unknown; // forwarded by *ngComponentOutlet via previewInputs
}

const ARTIFACT = { ID: 'a1', Name: 'Q3 Report', Type: 'Document', Description: 'desc' } as unknown as MJArtifactEntity;
const VERSION = { VersionNumber: 2, Name: 'Q3 Report v2', MimeType: 'application/pdf' } as unknown as MJArtifactVersionEntity;

interface Fakes { icon?: string; preview?: unknown }
const render = (inputs: Record<string, unknown> = {}, fakes: Fakes = {}) =>
  renderComponentFixture(ArtifactMessageCardComponent, {
    declarations: [ArtifactMessageCardComponent],
    imports: [StubPreview],
    providers: [
      { provide: ArtifactIconService, useValue: { getArtifactIcon: () => fakes.icon ?? 'fa-file-pdf' } },
      { provide: ArtifactPreviewResolverService, useValue: { resolvePreviewComponent: () => fakes.preview ?? null } },
    ],
    inputs: { artifact: ARTIFACT, artifactVersion: VERSION, ...inputs },
  });
type Fx = ReturnType<typeof render>;

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
});
