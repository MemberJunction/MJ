import { describe, it, expect, vi } from 'vitest';
import { CommonModule } from '@angular/common';
import { ComponentFixture } from '@angular/core/testing';
import { renderComponentFixture, query, queryAll, createFakeProvider } from '@memberjunction/ng-test-utils';
import { UserInfo } from '@memberjunction/core';
import { MJArtifactEntity, MJArtifactVersionEntity } from '@memberjunction/core-entities';
import { ArtifactVersionHistoryComponent } from './artifact-version-history.component';

/**
 * DOM-level spec for <mj-artifact-version-history> — a data-bound, module-declared
 * (standalone:false) component. ngOnInit fires loadVersions() through
 * RunView.FromMetadataProvider(ProviderToUse), but that async fire-and-forget races the
 * test, so we set the public `versions` array via setup BEFORE the first detectChanges
 * (zoneless §5 option 2: set state before the first CD). A fake provider is still supplied
 * so the racing load is a harmless no-op (returns the same rows). Verifies empty-state vs.
 * list gating, version rendering, selected-version action-panel gating, and @Output emission.
 *
 * Needs CommonModule for the `| date` pipe in the version-date binding.
 */

// The template reads VersionNumber / __mj_CreatedAt / Content only; plain objects suffice
// at runtime, typed to the entity shape via a single seam.
type VersionRow = Pick<MJArtifactVersionEntity, 'VersionNumber' | 'Content'> & { __mj_CreatedAt: Date };

const VERSIONS = [
  { VersionNumber: 2, Content: 'line a\nline b', __mj_CreatedAt: new Date('2026-01-02') },
  { VersionNumber: 1, Content: 'line a', __mj_CreatedAt: new Date('2026-01-01') },
] as unknown as MJArtifactVersionEntity[];

const ARTIFACT = { ID: 'art-1', Name: 'My Artifact' } as unknown as MJArtifactEntity;
const USER = { ID: 'me', Name: 'Me' } as unknown as UserInfo;

describe('ArtifactVersionHistoryComponent (DOM, data-bound)', () => {
  function renderWith(versions: MJArtifactVersionEntity[]): ComponentFixture<ArtifactVersionHistoryComponent> {
    return renderComponentFixture(ArtifactVersionHistoryComponent, {
      imports: [CommonModule],
      declarations: [ArtifactVersionHistoryComponent],
      inputs: {
        Provider: createFakeProvider<VersionRow>({ runViewResults: versions as unknown as VersionRow[] }),
        artifact: ARTIFACT,
        currentUser: USER,
      },
      setup: (c) => {
        c.versions = versions; // populate BEFORE first CD so the synchronous render reflects it
      },
    });
  }

  it('shows the empty state when there are no versions', () => {
    const f = renderWith([]);
    expect(query(f, '.empty-state')).not.toBeNull();
    expect(queryAll(f, '.version-item').length).toBe(0);
  });

  it('renders one item per version with the version number', () => {
    const f = renderWith(VERSIONS);
    expect(query(f, '.empty-state')).toBeNull();
    expect(queryAll(f, '.version-item').length).toBe(2);
    expect(query(f, '.version-number')?.textContent?.trim()).toBe('v2');
  });

  it('does not show the per-version action panel until a version is selected', () => {
    const f = renderWith(VERSIONS);
    expect(query(f, '.version-actions')).toBeNull();
  });

  it('selects a version on click, applying the selected class and showing actions', () => {
    const f = renderWith(VERSIONS);
    (queryAll(f, '.version-item')[0] as HTMLElement).click(); // real DOM event marks the view dirty
    f.detectChanges();

    expect((queryAll(f, '.version-item')[0] as HTMLElement).classList.contains('selected')).toBe(true);
    expect(query(f, '.version-actions')).not.toBeNull();
    expect(queryAll(f, '.version-actions .btn-action').length).toBe(3); // Restore / Compare / Download
  });

  it('emits versionSelected with the version number on click', () => {
    const f = renderWith(VERSIONS);
    const spy = vi.fn<(n: number) => void>();
    f.componentInstance.versionSelected.subscribe(spy);

    (queryAll(f, '.version-item')[0] as HTMLElement).click();
    expect(spy).toHaveBeenCalledWith(2);
  });

  it('emits closed when the header close button is clicked', () => {
    const f = renderWith([]);
    const spy = vi.fn();
    f.componentInstance.closed.subscribe(spy);

    (query(f, '.btn-close') as HTMLButtonElement).click();
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
