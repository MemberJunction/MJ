import { describe, it, expect } from 'vitest';
import { MJPageLayoutComponent } from '../lib/page-layout/page-layout.component';
import { MJPageHeaderComponent } from '../lib/page-header/page-header.component';
import { MJFilterToggleComponent } from '../lib/filter-toggle/filter-toggle.component';
import { MJResultCountComponent } from '../lib/result-count/result-count.component';
import { MJTabNavComponent, TabConfig } from '../lib/tab-nav/tab-nav.component';
import { MJViewToggleComponent, ViewToggleOption } from '../lib/view-toggle/view-toggle.component';

/**
 * Smoke + default-value coverage for shared chrome components whose meaningful
 * logic lives in the template. These tests catch accidental default changes
 * (e.g. someone renames a default Label and breaks every consumer at once) and
 * verify that the exported `TabConfig` / `ViewToggleOption` interfaces accept
 * the variants used across the dashboard codebase.
 */
describe('MJPageLayoutComponent', () => {
  it('should instantiate (smoke test)', () => {
    expect(new MJPageLayoutComponent()).toBeInstanceOf(MJPageLayoutComponent);
  });
});

describe('MJPageHeaderComponent', () => {
  it('should default Title to empty string', () => {
    expect(new MJPageHeaderComponent().Title).toBe('');
  });
  it('should default Icon to null (template hides the icon block when falsy)', () => {
    expect(new MJPageHeaderComponent().Icon).toBeNull();
  });
  it('should default Subtitle to null (template hides the subtitle when falsy)', () => {
    expect(new MJPageHeaderComponent().Subtitle).toBeNull();
  });
});

describe('MJFilterToggleComponent', () => {
  it('should default Active to false', () => {
    expect(new MJFilterToggleComponent().Active).toBe(false);
  });
  it('should default ShowLabel/HideLabel to canonical strings', () => {
    const c = new MJFilterToggleComponent();
    expect(c.ShowLabel).toBe('Show Filters');
    expect(c.HideLabel).toBe('Hide Filters');
  });
  it('should default Icon to fa-solid fa-filter', () => {
    expect(new MJFilterToggleComponent().Icon).toBe('fa-solid fa-filter');
  });
  it('should emit Toggled when the directive consumer fires it', () => {
    const c = new MJFilterToggleComponent();
    const emitted: void[] = [];
    c.Toggled.subscribe(() => emitted.push(undefined));
    c.Toggled.emit();
    expect(emitted.length).toBe(1);
  });
});

describe('MJResultCountComponent', () => {
  it('should default Count to 0', () => {
    expect(new MJResultCountComponent().Count).toBe(0);
  });
  it('should default Total to null (omit-Total path)', () => {
    expect(new MJResultCountComponent().Total).toBeNull();
  });
  it('should default Label to empty string', () => {
    expect(new MJResultCountComponent().Label).toBe('');
  });
});

describe('MJTabNavComponent', () => {
  it('should default Tabs to empty array', () => {
    expect(new MJTabNavComponent().Tabs).toEqual([]);
  });
  it('should default ActiveKey to empty string', () => {
    expect(new MJTabNavComponent().ActiveKey).toBe('');
  });
  it('should emit TabChange with the clicked key', () => {
    const c = new MJTabNavComponent();
    const emitted: string[] = [];
    c.TabChange.subscribe((k: string) => emitted.push(k));
    c.TabChange.emit('jobs');
    expect(emitted).toEqual(['jobs']);
  });
  it('TabConfig should accept the variants used across dashboards', () => {
    // Type-shape assertion: if any of these stop compiling we've broken
    // a contract that the dashboards rely on.
    const tabs: TabConfig[] = [
      { key: 'overview', label: 'Overview' },
      { key: 'jobs', label: 'Jobs', icon: 'fa-solid fa-clipboard-list', badge: 5 },
      { key: 'errors', label: 'Errors', badge: 3, badgeVariant: 'error' },
      { key: 'pending', label: 'Pending', badge: 'NEW', badgeVariant: 'warning' },
      { key: 'live', label: 'Live', badge: null },  // badge hidden when null
    ];
    expect(tabs.length).toBe(5);
  });
});

describe('MJViewToggleComponent', () => {
  it('should default Options to empty array', () => {
    expect(new MJViewToggleComponent().Options).toEqual([]);
  });
  it('should default ActiveKey to empty string', () => {
    expect(new MJViewToggleComponent().ActiveKey).toBe('');
  });
  it('should emit KeyChange with the clicked key', () => {
    const c = new MJViewToggleComponent();
    const emitted: string[] = [];
    c.KeyChange.subscribe((k: string) => emitted.push(k));
    c.KeyChange.emit('grid');
    expect(emitted).toEqual(['grid']);
  });
  it('ViewToggleOption should accept icon-only AND text-label variants', () => {
    const opts: ViewToggleOption[] = [
      { key: 'grid', icon: 'fa-solid fa-grip', title: 'Grid View' },           // icon-only
      { key: 'list', icon: 'fa-solid fa-list', label: 'List' },                // icon + label
      { key: 'index', icon: 'fa-solid fa-cubes', title: 'Index View' },        // icon-only with explicit title
    ];
    expect(opts.length).toBe(3);
  });
});
