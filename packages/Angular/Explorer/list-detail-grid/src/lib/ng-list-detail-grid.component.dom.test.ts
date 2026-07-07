import { describe, it, expect } from 'vitest';
import { provideRouter } from '@angular/router';
import { renderComponentFixture, query } from '@memberjunction/ng-test-utils';
import { SharedService } from '@memberjunction/ng-shared';
import { ListDetailGridComponent } from './ng-list-detail-grid.component';
import { ListDetailGridModule } from '../module';

/**
 * DOM coverage for <mj-list-detail-grid>. This component is a thin wrapper over the AG-Grid-backed
 * <mj-entity-data-grid>; that data grid is exercised by the ng-entity-viewer package and e2e, not
 * re-rendered here. The DOM surface this component actually OWNS is the placeholder gating:
 *   - the empty-state prompt shown when no list is selected (`!listId && !listEntity`), and
 *   - that the grid is NOT rendered until a list is loaded.
 *
 * With no list inputs, ngOnInit does not trigger the async load, so `isLoading` stays false and a
 * single synchronous render is enough (no zoneless load-flush needed). The real ListDetailGridModule
 * is imported so the child elements (`mj-empty-state`, `mj-loading`, `mj-entity-data-grid`) resolve;
 * `SharedService` (constructor DI, used only in navigation handlers) is a bare stub, and an empty
 * router satisfies the module's RouterModule import.
 */

function render(inputs: Record<string, unknown> = {}) {
  return renderComponentFixture(ListDetailGridComponent, {
    imports: [ListDetailGridModule],
    providers: [{ provide: SharedService, useValue: {} as unknown as SharedService }, provideRouter([])],
    inputs,
  });
}

describe('ListDetailGridComponent (DOM)', () => {
  it('shows the empty-state prompt when no list is selected', () => {
    const fixture = render();
    const empty = query(fixture, 'mj-empty-state');
    expect(empty).not.toBeNull();
    expect(empty?.textContent).toContain('Select a list to view its records');
  });

  it('does not render the data grid or loading indicator when no list is selected', () => {
    const fixture = render();
    expect(query(fixture, 'mj-entity-data-grid')).toBeNull();
    expect(query(fixture, 'mj-loading')).toBeNull();
  });

  it('always renders the container wrapper', () => {
    expect(query(render(), '.list-detail-grid-container')).not.toBeNull();
  });
});
