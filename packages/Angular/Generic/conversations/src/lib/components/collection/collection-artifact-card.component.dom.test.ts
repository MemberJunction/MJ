import { describe, it, expect, vi } from 'vitest';
import { CommonModule } from '@angular/common';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { ArtifactIconService } from '@memberjunction/ng-artifacts';
import type { UserInfo } from '@memberjunction/core';
import type { MJArtifactEntity, MJArtifactVersionEntity } from '@memberjunction/core-entities';
import { renderComponentFixture, query, text } from '@memberjunction/ng-test-utils';
import { CollectionArtifactCardComponent } from './collection-artifact-card.component';
import { ArtifactPermissionService } from '../../services/artifact-permission.service';

/**
 * DOM spec for <mj-collection-artifact-card>. Injects ArtifactPermissionService +
 * ArtifactIconService (stubbed via providers) and async-loads canShare/canEdit in
 * ngOnInit. We assert the template contract directly: name/type/icon/version/
 * description rendering, the select/view outputs (with the view button's
 * stopPropagation), and the canShare/canEdit-gated action buttons + their outputs
 * (driven through the stubbed permission service, flushed before asserting).
 */
describe('CollectionArtifactCardComponent (DOM)', () => {
  const currentUser = { ID: 'u1' } as unknown as UserInfo;
  const makeArtifact = (overrides: Partial<MJArtifactEntity> = {}): MJArtifactEntity =>
    ({ ID: 'art1', Name: 'Quarterly Report', Type: 'Document', Description: 'Q3 numbers', ...overrides }) as unknown as MJArtifactEntity;

  // The async loadPermissions() in ngOnInit calls checkPermission(...) per action; the
  // stub answers per action so canShare/canEdit settle deterministically.
  const render = (checkPermission: (action: string) => boolean = () => false, inputs: Record<string, unknown> = {}) =>
    renderComponentFixture(CollectionArtifactCardComponent, {
      imports: [CommonModule, MJButtonDirective],
      declarations: [CollectionArtifactCardComponent],
      providers: [
        {
          provide: ArtifactPermissionService,
          useValue: { checkPermission: (_id: string, _u: string, action: string) => Promise.resolve(checkPermission(action)) },
        },
        { provide: ArtifactIconService, useValue: { getArtifactIcon: () => 'fa-file-lines' } },
      ],
      inputs: { artifact: makeArtifact(), currentUser, ...inputs },
    });

  // Flush the async permission load (two sequential awaits) then settle the view.
  const settlePermissions = async (f: ReturnType<typeof render>) => {
    await new Promise((r) => setTimeout(r));
    f.detectChanges();
  };

  it('renders the artifact name and type', () => {
    const f = render();
    expect(text(f, '.artifact-name')).toContain('Quarterly Report');
    expect(text(f, '.artifact-type')).toContain('Document');
  });

  it('uses the icon service for the card icon', () => {
    const f = render();
    expect(query(f, '.card-icon i')?.classList.contains('fa-file-lines')).toBe(true);
  });

  it('renders the version badge only when a version is provided', () => {
    const withVersion = render(() => false, { version: { VersionNumber: 3 } as unknown as MJArtifactVersionEntity });
    expect(text(withVersion, '.version-badge')).toContain('v3');
  });

  it('omits the version badge when no version is provided', () => {
    expect(query(render(), '.version-badge')).toBeNull();
  });

  it('renders the description when present', () => {
    expect(text(render(), '.artifact-description')).toContain('Q3 numbers');
  });

  it('omits the description block when there is none', () => {
    const f = render(() => false, { artifact: makeArtifact({ Description: '' }) });
    expect(query(f, '.artifact-description')).toBeNull();
  });

  it('emits selected with the artifact when the card is clicked', () => {
    const artifact = makeArtifact();
    const f = render(() => false, { artifact });
    const spy = vi.fn();
    f.componentInstance.selected.subscribe(spy);
    (query(f, '.artifact-card') as HTMLElement).click();
    expect(spy).toHaveBeenCalledWith(artifact);
  });

  it('emits viewed (and not selected) when the View button is clicked', () => {
    const f = render();
    const viewedSpy = vi.fn();
    const selectedSpy = vi.fn();
    f.componentInstance.viewed.subscribe(viewedSpy);
    f.componentInstance.selected.subscribe(selectedSpy);
    (query(f, 'button[title="View"]') as HTMLButtonElement).click();
    expect(viewedSpy).toHaveBeenCalled();
    expect(selectedSpy).not.toHaveBeenCalled(); // stopPropagation prevents the card-level select
  });

  it('hides the Share and Edit actions until permissions allow them', () => {
    const f = render();
    expect(query(f, 'button[title="Share"]')).toBeNull();
    expect(query(f, 'button[title="Edit"]')).toBeNull();
  });

  it('shows the Share action and emits shared once share permission resolves', async () => {
    const f = render((action) => action === 'share');
    await settlePermissions(f);
    const btn = query(f, 'button[title="Share"]');
    expect(btn).not.toBeNull();
    const spy = vi.fn();
    f.componentInstance.shared.subscribe(spy);
    (btn as HTMLButtonElement).click();
    expect(spy).toHaveBeenCalled();
  });

  it('shows the Edit and Remove actions and emits once edit permission resolves', async () => {
    const f = render((action) => action === 'edit');
    await settlePermissions(f);
    const editedSpy = vi.fn();
    const removedSpy = vi.fn();
    f.componentInstance.edited.subscribe(editedSpy);
    f.componentInstance.removed.subscribe(removedSpy);
    (query(f, 'button[title="Edit"]') as HTMLButtonElement).click();
    (query(f, 'button[title="Remove from collection"]') as HTMLButtonElement).click();
    expect(editedSpy).toHaveBeenCalled();
    expect(removedSpy).toHaveBeenCalled();
  });
});
