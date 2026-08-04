import { describe, it, expect } from 'vitest';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ComponentFixture } from '@angular/core/testing';
import { MJButtonDirective, MJEmptyStateComponent } from '@memberjunction/ng-ui-components';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { renderComponentFixture, query, text, click, createFakeProvider } from '@memberjunction/ng-test-utils';
import { DataContextComponent } from './ng-data-context.component';

/**
 * DOM-level spec for <mj-data-context> (module-declared, data-bound).
 *
 * We render WITHOUT a dataContextId so ngOnInit's async LoadDataContext() (which would
 * call GetEntityObject + RunView against a backend) does not run — that keeps each test
 * deterministic and lets us drive the template's gating branches directly via internal
 * state set in `setup` (before the first detectChanges, per zoneless §5/§5.2 of the guide).
 * A fake provider is still supplied because ProviderToUse is read during rendering.
 *
 * Item-card rendering is intentionally NOT tested here: those rows are heavyweight
 * MJDataContextItemEntity (BaseEntity) instances that can't be honestly constructed
 * without a provider/backend — see the deferred note in the rollout report.
 */
describe('DataContextComponent (DOM, data-bound)', () => {
  const provider = () => createFakeProvider({ runViewResults: [] });

  function render(setup?: (c: DataContextComponent) => void): ComponentFixture<DataContextComponent> {
    return renderComponentFixture(DataContextComponent, {
      imports: [CommonModule, FormsModule, MJButtonDirective, MJEmptyStateComponent, SharedGenericModule],
      declarations: [DataContextComponent],
      inputs: { Provider: provider() },
      setup: (c) => setup?.(c),
    });
  }

  it('shows the loader (and hides the header) while loading', () => {
    const f = render((c) => {
      c.showLoader = true;
    });
    expect(query(f, 'mj-loading')).not.toBeNull();
    expect(query(f, '.data-context-header')).toBeNull();
  });

  it('renders the header with the fallback title and the empty state when not loading', () => {
    const f = render(); // showLoader defaults false, no items
    expect(query(f, '.data-context-header')).not.toBeNull();
    expect(text(f, '.header-title h2')).toBe('Data Context');
    // filteredItems is empty -> the empty-state block renders
    expect(query(f, 'mj-empty-state')).not.toBeNull();
    expect(text(f, 'mj-empty-state .mj-empty-state__title')).toBe('No items found');
  });

  it('renders the record name in the header when a record is loaded', () => {
    const f = render((c) => {
      // dataContextRecord only needs Name/Description for the header binding; a minimal
      // typed stub is sufficient for the template read paths exercised here.
      c.dataContextRecord = { Name: 'My Context', Description: 'desc here' } as DataContextComponent['dataContextRecord'];
    });
    expect(text(f, '.header-title h2')).toBe('My Context');
    expect(text(f, '.header-description')).toBe('desc here');
  });

  it('renders the error banner when errorMessage is set', () => {
    const f = render((c) => {
      c.errorMessage = 'Boom';
    });
    expect(query(f, '.error-message')).not.toBeNull();
    expect(text(f, '.error-message')).toContain('Boom');
  });

  it('hides the error banner when there is no errorMessage', () => {
    const f = render();
    expect(query(f, '.error-message')).toBeNull();
  });

  it('shows the item count label with correct singular/plural (zero items)', () => {
    const f = render();
    // itemCount === 0 -> uses the plural "items" branch
    expect(text(f, '.header-meta')).toContain('0 items');
  });

  it('renders the search input bound for filtering', () => {
    const f = render();
    expect(query(f, 'input.search-input')).not.toBeNull();
  });

  it('does not render the SQL preview overlay by default', () => {
    const f = render();
    expect(query(f, '.sql-preview-overlay')).toBeNull();
  });

  it('renders the SQL preview overlay and closes it via the close button', () => {
    // Set preview state BEFORE the first detectChanges (zoneless §5: mutate-then-render
    // would trip NG0100 because the @for index re-binds during the check-no-changes pass).
    const f = render((c) => {
      c.showSQLPreview = true;
      c.previewSQL = 'SELECT 1';
    });
    expect(query(f, '.sql-preview-overlay')).not.toBeNull();
    expect(text(f, '.sql-preview-content')).toContain('SELECT 1');

    // close via the close button — a real DOM event marks the view dirty, so the
    // subsequent detectChanges is NG0100-safe.
    click(f, '.sql-preview-header .close-btn');
    f.detectChanges();
    expect(query(f, '.sql-preview-overlay')).toBeNull();
  });
});
