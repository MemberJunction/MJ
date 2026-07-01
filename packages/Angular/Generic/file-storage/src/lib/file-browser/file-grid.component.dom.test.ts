import { describe, it, expect } from 'vitest';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ComponentFixture } from '@angular/core/testing';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { MJEmptyStateComponent } from '@memberjunction/ng-ui-components';
import { renderComponentFixture, query, queryAll, text, capture } from '@memberjunction/ng-test-utils';
import { FileGridComponent, FileGridItem } from './file-grid.component';

/**
 * DOM spec for <mj-file-grid>. The component's only data path is loadItems(), which is
 * gated behind `ngOnChanges` for the `account`/`folderPath` inputs AND returns early when
 * `account` is null (which it stays here — we never set it). So no GraphQL call fires and
 * the rendered surface is driven entirely by the public presentational state we set via
 * `setup` BEFORE the first detectChanges (zoneless §5). We assert on @if gating, the
 * list/grid view rendering, toolbar [disabled] gating derived from selection, the up-nav
 * [disabled] derived from folderPath, dialog gating, and the folderNavigate emission.
 */
const MOD = {
  imports: [CommonModule, FormsModule, SharedGenericModule, MJEmptyStateComponent],
  declarations: [FileGridComponent],
};

function render(setup?: (c: FileGridComponent) => void): ComponentFixture<FileGridComponent> {
  return renderComponentFixture(FileGridComponent, { ...MOD, setup });
}

const FOLDER: FileGridItem = { key: 'docs/', name: 'docs', type: 'folder', size: 0, lastModified: new Date('2024-01-01') };
const PDF: FileGridItem = { key: 'a.pdf', name: 'a.pdf', type: 'file', size: 2048, lastModified: new Date('2024-01-02') };
const TXT: FileGridItem = { key: 'b.txt', name: 'b.txt', type: 'file', size: 10, lastModified: new Date('2024-01-03') };

describe('FileGridComponent (DOM)', () => {
  it('shows the loading indicator and hides the breadcrumb bar while isLoading', () => {
    const f = render((c) => {
      c.isLoading = true;
    });
    expect(query(f, 'mj-loading')).not.toBeNull();
    expect(query(f, '.breadcrumb-bar')).toBeNull();
    expect(query(f, '.file-table')).toBeNull();
  });

  it('shows the error block with a retry button when errorMessage is set and not loading', () => {
    const f = render((c) => {
      c.isLoading = false;
      c.errorMessage = 'Failed to load files';
    });
    expect(query(f, 'mj-empty-state')).not.toBeNull();
    expect(text(f, 'mj-empty-state .mj-empty-state__message')).toBe('Failed to load files');
    // The error empty-state exposes its retry as the built-in CTA (ActionText="Retry").
    expect(text(f, 'mj-empty-state .mj-empty-state__actions button')).toContain('Retry');
    expect(query(f, '.breadcrumb-bar')).toBeNull();
  });

  it('renders the empty state when there are no filtered items', () => {
    const f = render((c) => {
      c.items = [];
      c.filteredItems = [];
    });
    expect(query(f, 'mj-empty-state')).not.toBeNull();
    expect(text(f, 'mj-empty-state .mj-empty-state__title')).toBe('This folder is empty');
    expect(query(f, '.file-table')).toBeNull();
  });

  it('renders rows in list view with name, type and size cells', () => {
    const f = render((c) => {
      c.viewMode = 'list';
      c.items = [FOLDER, PDF];
      c.filteredItems = [FOLDER, PDF];
    });
    expect(query(f, '.file-table')).not.toBeNull();
    const rows = queryAll(f, '.file-row');
    expect(rows.length).toBe(2);
    expect(queryAll(f, '.item-name').map((e) => e.textContent?.trim())).toEqual(['docs', 'a.pdf']);
    // folder size shows the em-dash sentinel; file shows a formatted size
    const sizes = queryAll(f, '.item-size').map((e) => e.textContent?.trim());
    expect(sizes[0]).toBe('—');
    expect(sizes[1]).toBe('2 KB');
    // type column derives from extension / folder
    expect(queryAll(f, '.item-type').map((e) => e.textContent?.trim())).toEqual(['Folder', 'PDF Document']);
  });

  it('renders tiles in grid view (no table) when viewMode is grid', () => {
    const f = render((c) => {
      c.viewMode = 'grid';
      c.items = [PDF];
      c.filteredItems = [PDF];
    });
    expect(query(f, '.file-grid')).not.toBeNull();
    expect(query(f, '.file-table')).toBeNull();
    expect(queryAll(f, '.grid-item').length).toBe(1);
    expect(text(f, '.grid-name')).toBe('a.pdf');
  });

  it('marks the selected row with the selected class', () => {
    const f = render((c) => {
      c.viewMode = 'list';
      c.items = [PDF, TXT];
      c.filteredItems = [PDF, TXT];
      c.selectedItems = [TXT.key];
    });
    const rows = queryAll(f, '.file-row');
    expect(rows[0].classList.contains('selected')).toBe(false);
    expect(rows[1].classList.contains('selected')).toBe(true);
  });

  it('disables single-selection toolbar actions when nothing is selected', () => {
    const f = render((c) => {
      c.items = [PDF];
      c.filteredItems = [PDF];
      c.selectedItems = [];
    });
    const download = query(f, '.toolbar-btn:nth-child(3)') as HTMLButtonElement; // Download
    expect(download.disabled).toBe(true);
  });

  it('enables single-selection toolbar actions when exactly one item is selected', () => {
    const f = render((c) => {
      c.items = [PDF];
      c.filteredItems = [PDF];
      c.selectedItems = [PDF.key];
    });
    const download = query(f, '.toolbar-btn:nth-child(3)') as HTMLButtonElement; // Download
    expect(download.disabled).toBe(false);
  });

  it('disables the up-navigation button at the root (empty folderPath)', () => {
    const f = renderComponentFixture(FileGridComponent, {
      ...MOD,
      inputs: { folderPath: '' },
      setup: (c) => {
        c.filteredItems = [PDF];
      },
    });
    expect((query(f, '.nav-btn') as HTMLButtonElement).disabled).toBe(true);
  });

  it('enables the up-navigation button inside a sub-folder', () => {
    const f = renderComponentFixture(FileGridComponent, {
      ...MOD,
      inputs: { folderPath: 'docs/reports/' },
      setup: (c) => {
        c.filteredItems = [PDF];
      },
    });
    expect((query(f, '.nav-btn') as HTMLButtonElement).disabled).toBe(false);
  });

  it('emits folderNavigate with the parent path when up-navigation is clicked', () => {
    const f = renderComponentFixture(FileGridComponent, {
      ...MOD,
      inputs: { folderPath: 'docs/reports/' },
      setup: (c) => {
        c.filteredItems = [PDF];
      },
    });
    const emitted = capture(f.componentInstance.folderNavigate);
    (query(f, '.nav-btn') as HTMLButtonElement).click();
    expect(emitted).toEqual(['docs/']);
  });

  it('marks the active view-toggle button based on viewMode', () => {
    const f = render((c) => {
      c.viewMode = 'grid';
      c.filteredItems = [PDF];
    });
    const viewBtns = queryAll(f, '.view-btn');
    // first is list, second is grid
    expect(viewBtns[0].classList.contains('active')).toBe(false);
    expect(viewBtns[1].classList.contains('active')).toBe(true);
  });

  it('does not render the new-folder dialog by default', () => {
    const f = render((c) => {
      c.filteredItems = [PDF];
    });
    expect(query(f, '.modal-dialog')).toBeNull();
  });

  it('renders the new-folder dialog when showNewFolderDialog is true', () => {
    const f = render((c) => {
      c.filteredItems = [PDF];
      c.showNewFolderDialog = true;
    });
    expect(query(f, '.modal-dialog')).not.toBeNull();
    expect(query(f, '.modal-overlay')).not.toBeNull();
  });

  it('shows the multi-provider search panel in search mode', () => {
    const f = render((c) => {
      c.isMultiProviderSearchMode = true;
    });
    expect(query(f, '.multi-provider-search-panel')).not.toBeNull();
  });

  it('opens the new-folder dialog when the New Folder toolbar button is clicked', () => {
    const f = render((c) => {
      c.filteredItems = [PDF];
    });
    expect(query(f, '.modal-dialog')).toBeNull();
    const btn = queryAll(f, '.toolbar-btn').find((b) => b.textContent?.includes('New Folder')) as HTMLButtonElement;
    btn.click(); // onNewFolderClick() -> showNewFolderDialog = true
    f.detectChanges();
    expect(query(f, '.modal-dialog')).not.toBeNull();
  });

  it('flips the name-column sort indicator when its header is clicked', () => {
    const f = render((c) => {
      c.viewMode = 'list';
      c.items = [FOLDER, PDF];
      c.filteredItems = [FOLDER, PDF];
    });
    const nameHeader = query(f, 'th.col-name') as HTMLElement;
    expect(nameHeader.querySelector('.fa-caret-up')).not.toBeNull(); // default sort name/asc
    nameHeader.click(); // onSortChange(...) -> name/desc
    f.detectChanges();
    expect(nameHeader.querySelector('.fa-caret-down')).not.toBeNull();
    expect(nameHeader.querySelector('.fa-caret-up')).toBeNull();
  });
});
