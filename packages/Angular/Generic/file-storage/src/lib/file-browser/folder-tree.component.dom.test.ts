import { describe, it, expect } from 'vitest';
import { CommonModule } from '@angular/common';
import { ComponentFixture } from '@angular/core/testing';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { renderComponentFixture, query, queryAll, text, click, capture } from '@memberjunction/ng-test-utils';
import { FolderTreeComponent, BreadcrumbItem, FolderItem } from './folder-tree.component';

/**
 * DOM spec for <mj-folder-tree>. The component's only data path is the `account` input
 * setter, which calls a GraphQL client — we never set that input. Instead we drive the
 * public presentational state (breadcrumbs / folders / isLoading / errorMessage /
 * currentPath) via `setup` BEFORE the first detectChanges (zoneless §5: no
 * mutate-then-detectChanges), and assert on the rendered tree. Output emissions are
 * exercised through the public navigation handlers (navigateToPath pushes the path it
 * emits, so onFolderClick / onBreadcrumbClick emit `folderSelected`).
 */
const MOD = {
  imports: [CommonModule, MJButtonDirective, SharedGenericModule],
  declarations: [FolderTreeComponent],
};

const ACCOUNT = { account: { ID: 'acct-1', Name: 'My Bucket' } } as FolderTreeComponent['account'];

function render(setup: (c: FolderTreeComponent) => void): ComponentFixture<FolderTreeComponent> {
  return renderComponentFixture(FolderTreeComponent, { ...MOD, setup });
}

describe('FolderTreeComponent (DOM)', () => {
  it('hides the navigation bar when no account is set', () => {
    const f = render(() => {
      /* leave account null */
    });
    expect(query(f, '.navigation-bar')).toBeNull();
  });

  it('shows the navigation bar with breadcrumbs once an account + breadcrumbs are present', () => {
    const crumbs: BreadcrumbItem[] = [
      { label: 'My Bucket', path: '/' },
      { label: 'docs', path: '/docs' },
    ];
    const f = render((c) => {
      c['_account'] = ACCOUNT;
      c.breadcrumbs = crumbs;
    });
    expect(query(f, '.navigation-bar')).not.toBeNull();
    const items = queryAll(f, '.breadcrumb-item');
    expect(items.length).toBe(2);
    expect(items[0].textContent?.trim()).toBe('My Bucket');
    expect(items[1].textContent?.trim()).toBe('docs');
    // last crumb carries the `.current` class
    expect(items[1].classList.contains('current')).toBe(true);
    expect(items[0].classList.contains('current')).toBe(false);
  });

  it('disables back/forward buttons based on history position', () => {
    const f = render((c) => {
      c['_account'] = ACCOUNT;
      c.breadcrumbs = [{ label: 'My Bucket', path: '/' }];
      c.history = ['/'];
      c.historyIndex = 0; // canGoBack=false, canGoForward=false
    });
    const navButtons = queryAll(f, '.nav-button') as HTMLButtonElement[];
    expect(navButtons.length).toBe(2);
    expect(navButtons[0].disabled).toBe(true);
    expect(navButtons[1].disabled).toBe(true);
  });

  it('shows the loading indicator while isLoading is true', () => {
    const f = render((c) => {
      c.isLoading = true;
    });
    expect(query(f, 'mj-loading')).not.toBeNull();
    expect(query(f, '.folder-list')).toBeNull();
  });

  it('shows the error block when errorMessage is set and not loading', () => {
    const f = render((c) => {
      c.isLoading = false;
      c.errorMessage = 'Boom failed';
    });
    expect(query(f, '.tree-error')).not.toBeNull();
    expect(text(f, '.error-text')).toBe('Boom failed');
    expect(query(f, '.folder-list')).toBeNull();
  });

  it('renders the folder list when folders are present', () => {
    const folders: FolderItem[] = [
      { name: 'images', fullPath: '/images/' },
      { name: 'reports', fullPath: '/reports/' },
    ];
    const f = render((c) => {
      c.folders = folders;
    });
    const items = queryAll(f, '.folder-item');
    expect(items.length).toBe(2);
    expect(queryAll(f, '.folder-name').map((e) => e.textContent?.trim())).toEqual(['images', 'reports']);
    expect(query(f, '.tree-placeholder')).toBeNull();
  });

  it('renders the empty placeholder with account name and path when there are no folders', () => {
    const f = render((c) => {
      c['_account'] = ACCOUNT;
      c.folders = [];
      c.currentPath = '/docs';
    });
    expect(query(f, '.tree-placeholder')).not.toBeNull();
    expect(text(f, '.placeholder-text')).toBe('No folders in this location');
    const hints = queryAll(f, '.placeholder-hint').map((e) => e.textContent?.trim());
    expect(hints).toContain('Account: My Bucket');
    expect(hints).toContain('Path: /docs');
  });

  it('emits folderSelected with the folder path when a folder is clicked', () => {
    const folders: FolderItem[] = [{ name: 'images', fullPath: '/images/' }];
    const f = render((c) => {
      c['_account'] = ACCOUNT;
      c.folders = folders;
      c.currentPath = '/';
      c.history = ['/'];
      c.historyIndex = 0;
    });
    const emitted = capture(f.componentInstance.folderSelected);
    click(f, '.folder-item');
    expect(emitted).toEqual(['/images/']);
  });

  it('emits folderSelected with the breadcrumb path when a breadcrumb is clicked', () => {
    const f = render((c) => {
      c['_account'] = ACCOUNT;
      c.breadcrumbs = [
        { label: 'My Bucket', path: '/' },
        { label: 'docs', path: '/docs' },
      ];
      c.currentPath = '/';
      c.history = ['/'];
      c.historyIndex = 0;
    });
    const emitted = capture(f.componentInstance.folderSelected);
    // click the second (non-current) breadcrumb → navigates to /docs
    const items = queryAll(f, '.breadcrumb-item') as HTMLButtonElement[];
    items[1].click();
    expect(emitted).toEqual(['/docs']);
  });
});
