import { describe, it, expect } from 'vitest';
import { CommonModule } from '@angular/common';
import { ComponentFixture } from '@angular/core/testing';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { FileStorageEngineBase } from '@memberjunction/core-entities';
import { renderComponentFixture, query, text } from '@memberjunction/ng-test-utils';
import { StorageProvidersListComponent } from './storage-providers-list.component';

/**
 * DOM spec for <mj-storage-providers-list>.
 *
 * SCOPE: only the always-present header and the loading branch are covered, because both are
 * stable on the component's FIRST (and only) change-detection pass.
 *
 * DEFERRED — the error / empty / account-list branches and the per-account badges, selected
 * class, and accountSelected emission. Two component-side issues block an honest DOM unit test:
 *   1. ngOnInit calls loadAccounts(), which sets `isLoading = true` synchronously before its
 *      (frozen-in-test) `engine.Config()` await. That runs during the first detectChanges, AFTER
 *      our setup, so any `isLoading=false` we seed before render is clobbered — the list/error/
 *      empty branches never get a chance to render on the first pass.
 *   2. The component trips the zoneless dev-mode NG0100 check on ANY second detectChanges
 *      (a roving index/tabindex binding flips, e.g. '4' -> '-1'), so the set-state-then-re-detect
 *      workaround is also unavailable.
 * Masking either (prod mode / detectChanges(false)) is disallowed. Covering this surface needs a
 * testability seam — not auto-loading in ngOnInit, and/or fixing the index-binding CD stability —
 * tracked for a follow-up. (The other three file-storage components are fully DOM-covered.)
 */
const MOD = {
  imports: [CommonModule, SharedGenericModule],
  declarations: [StorageProvidersListComponent],
};

/** Stops ngOnInit's loadAccounts() from resolving (and async-clobbering state) by hanging at its await. */
function freezeEngineConfig(): void {
  FileStorageEngineBase.Instance.Config = () => new Promise<void>(() => {});
}

function render(setup?: (c: StorageProvidersListComponent) => void): ComponentFixture<StorageProvidersListComponent> {
  return renderComponentFixture(StorageProvidersListComponent, {
    ...MOD,
    setup: (c) => {
      freezeEngineConfig();
      setup?.(c);
    },
  });
}

describe('StorageProvidersListComponent (DOM — header + loading)', () => {
  it('always renders the header title', () => {
    const f = render();
    expect(text(f, '.header-title')).toBe('Storage Accounts');
  });

  it('shows the loading state on initial load', () => {
    // ngOnInit's loadAccounts() sets isLoading=true and then hangs on the frozen Config await,
    // so the loading branch is what renders on the first (stable) detectChanges.
    const f = render();
    expect(query(f, '.loading-state')).not.toBeNull();
    expect(query(f, 'mj-loading')).not.toBeNull();
    expect(query(f, '.providers-container')).toBeNull();
  });
});
