import { describe, it, expect } from 'vitest';
import { FormsModule } from '@angular/forms';
import { renderComponentFixture, query, queryAll, capture } from '@memberjunction/ng-test-utils';
import type { MCPDashboardFilters, MCPDashboardTab } from './mcp-dashboard.component';
import { MCPFilterPanelComponent } from './mcp-filter-panel.component';

/**
 * DOM coverage for <mj-mcp-filter-panel> — the MCP dashboard filter sidebar. Module-declared
 * (standalone:false), so declare it + import FormsModule (for ngModel). No DI/async. It is
 * @Input-driven: the active tab controls which status/context filters render; the active-filter count
 * drives a badge; and search/reset/close raise their outputs. Presentational — single sync render.
 */

const defaultFilters = (): MCPDashboardFilters => ({
  searchTerm: '',
  serverStatus: 'all',
  connectionStatus: 'all',
  toolStatus: 'all',
  logStatus: 'all',
  toolsServer: 'all',
  toolsCategory: 'all',
  favoritesOnly: false,
});

const render = (inputs: { filters?: MCPDashboardFilters; activeTab?: MCPDashboardTab; totalCount?: number; filteredCount?: number } = {}) =>
  renderComponentFixture(MCPFilterPanelComponent, {
    declarations: [MCPFilterPanelComponent],
    imports: [FormsModule],
    inputs: {
      filters: inputs.filters ?? defaultFilters(),
      activeTab: inputs.activeTab ?? 'servers',
      totalCount: inputs.totalCount ?? 0,
      filteredCount: inputs.filteredCount ?? 0,
    },
  });

describe('MCPFilterPanelComponent (DOM)', () => {
  it('renders the header with the filtered / total summary', () => {
    const fixture = render({ totalCount: 42, filteredCount: 7 });
    expect(query(fixture, '.filter-summary-inline .summary-value')?.textContent?.trim()).toBe('7');
    expect(query(fixture, '.filter-summary-inline .summary-label')?.textContent).toContain('42');
  });

  it('labels the status filter "Server Status" on the servers tab', () => {
    expect(render({ activeTab: 'servers' }).nativeElement.textContent).toContain('Server Status');
  });

  it('labels the status filter "Log Status" on the logs tab', () => {
    expect(render({ activeTab: 'logs' }).nativeElement.textContent).toContain('Log Status');
  });

  it('hides the tools-only Favorites filter off the tools tab', () => {
    expect(render({ activeTab: 'servers' }).nativeElement.textContent).not.toContain('Favorites only');
  });

  it('shows the tools-only Server + Category + Favorites filters on the tools tab', () => {
    const toolsTab = render({ activeTab: 'tools' });
    expect(toolsTab.nativeElement.textContent).toContain('Favorites only');
    expect(toolsTab.nativeElement.textContent).toContain('Category');
  });

  it('hides the active-filter count badge when all filters are default', () => {
    expect(query(render(), '.filter-panel-header h3 span')).toBeNull();
  });

  it('shows the active-filter count badge when filters are non-default', () => {
    const withFilters = render({ filters: { ...defaultFilters(), searchTerm: 'foo', serverStatus: 'Active' } });
    expect(query(withFilters, '.filter-panel-header h3 span')?.textContent?.trim()).toBe('2');
  });

  it('emits closePanel when the close button is clicked', () => {
    const fixture = render();
    const closed = capture(fixture.componentInstance.closePanel);
    (query(fixture, '.close-btn') as HTMLElement).click();
    expect(closed.length).toBe(1);
  });

  it('emits reset filters when Reset is clicked', () => {
    const fixture = render({ filters: { ...defaultFilters(), searchTerm: 'foo' } });
    const changed = capture(fixture.componentInstance.filtersChange);
    (query(fixture, '.reset-btn') as HTMLElement).click();
    expect(changed.length).toBe(1);
    expect(changed[0].searchTerm).toBe('');
  });
});
