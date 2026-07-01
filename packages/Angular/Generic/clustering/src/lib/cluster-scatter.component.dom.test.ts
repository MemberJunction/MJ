import { describe, it, expect } from 'vitest';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ComponentFixture } from '@angular/core/testing';
import { MJEntityCardComponent } from '@memberjunction/ng-entity-card';
import { MJEmptyStateComponent } from '@memberjunction/ng-ui-components';
import { renderComponentFixture, query, queryAll, text, capture } from '@memberjunction/ng-test-utils';
import { ClusterScatterComponent } from './cluster-scatter.component';
import { ClusterPoint, ClusterInfo, ClusterSelectedEvent } from './clustering.types';

/**
 * DOM-level spec for <mj-cluster-scatter>. The component renders a pure SVG scatter
 * plot — no media APIs (no getUserMedia/AudioContext/WebRTC), so the visual surface is
 * honestly unit-testable in jsdom. The tooltip/detail panel render a child
 * <mj-entity-card> (standalone), so we declare it as an import.
 *
 * autoDetect is used because ngOnChanges recomputes centroids during init, which would
 * otherwise trip the dev-mode NG0100 check on a single detectChanges().
 */
function renderScatter(inputs: Record<string, unknown> = {}): ComponentFixture<ClusterScatterComponent> {
  return renderComponentFixture(ClusterScatterComponent, {
    imports: [CommonModule, FormsModule, MJEntityCardComponent, MJEmptyStateComponent],
    declarations: [ClusterScatterComponent],
    inputs,
    autoDetect: true,
  });
}

const CLUSTERS: ClusterInfo[] = [
  { Id: 0, Label: 'Alpha', Color: '#5b8def', MemberCount: 2 },
  { Id: 1, Label: 'Beta', Color: '#34d399', MemberCount: 1 },
];

const POINTS: ClusterPoint[] = [
  { X: 100, Y: 100, ClusterId: 0, Label: 'P1', VectorKey: 'k1', Metadata: { Name: 'P1' } },
  { X: 200, Y: 200, ClusterId: 0, Label: 'P2', VectorKey: 'k2', Metadata: { Name: 'P2' } },
  { X: 600, Y: 400, ClusterId: 1, Label: 'P3', VectorKey: 'k3', Metadata: { Name: 'P3' } },
];

describe('ClusterScatterComponent (DOM)', () => {
  it('shows the empty state when there are no points and not loading', () => {
    const fixture = renderScatter({ Points: [], IsLoading: false });
    expect(query(fixture, 'mj-empty-state')).not.toBeNull();
    expect(text(fixture, 'mj-empty-state .mj-empty-state__title')).toBe('No data to display');
    expect(query(fixture, 'svg.scatter-svg')).toBeNull();
  });

  it('shows the loading overlay when IsLoading is true', () => {
    const fixture = renderScatter({ Points: [], IsLoading: true });
    expect(query(fixture, '.loading-overlay')).not.toBeNull();
    // Empty state is gated by !IsLoading, so it must NOT render while loading.
    expect(query(fixture, 'mj-empty-state')).toBeNull();
  });

  it('renders the SVG with one data-point circle per point', () => {
    const fixture = renderScatter({ Points: POINTS, Clusters: CLUSTERS });
    expect(query(fixture, 'svg.scatter-svg')).not.toBeNull();
    expect(queryAll(fixture, 'circle.data-point').length).toBe(3);
  });

  it('renders the cluster legend with a row per cluster (cluster color mode)', () => {
    const fixture = renderScatter({ Points: POINTS, Clusters: CLUSTERS, ShowLegend: true });
    expect(text(fixture, '.legend .legend-title')).toBe('Clusters');
    const labels = queryAll(fixture, '.legend .legend-label').map((l) => l.textContent?.trim());
    expect(labels).toEqual(['Alpha', 'Beta']);
  });

  it('hides the legend when ShowLegend is false', () => {
    const fixture = renderScatter({ Points: POINTS, Clusters: CLUSTERS, ShowLegend: false });
    expect(query(fixture, '.legend')).toBeNull();
  });

  it('emits ClusterSelected when a legend item is clicked', () => {
    const fixture = renderScatter({ Points: POINTS, Clusters: CLUSTERS, ShowLegend: true });
    const selected = capture<ClusterSelectedEvent>(fixture.componentInstance.ClusterSelected);
    (queryAll(fixture, '.legend .legend-item')[1] as HTMLElement).click();
    expect(selected.length).toBe(1);
    expect(selected[0].ClusterId).toBe(1);
    expect(selected[0].Label).toBe('Beta');
  });

  it('emits PointClicked and SelectionChanged when a point is clicked', () => {
    const fixture = renderScatter({ Points: POINTS, Clusters: CLUSTERS });
    const clicked = capture<ClusterPoint>(fixture.componentInstance.PointClicked);
    const selectionChanged = capture<Set<string>>(fixture.componentInstance.SelectionChanged);
    (queryAll(fixture, 'circle.data-point')[0] as unknown as SVGElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(clicked.length).toBe(1);
    expect(clicked[0].VectorKey).toBe('k1');
    expect(selectionChanged.length).toBe(1);
    expect(selectionChanged[0].has('k1')).toBe(true);
  });

  it('renders the entity legend (not cluster legend) when ColorBy is entity', () => {
    const entityPoints: ClusterPoint[] = [
      { X: 1, Y: 1, ClusterId: 0, Label: 'A', VectorKey: 'a', Metadata: { EntityName: 'Companies' } },
      { X: 2, Y: 2, ClusterId: 0, Label: 'B', VectorKey: 'b', Metadata: { EntityName: 'Contacts' } },
    ];
    const fixture = renderScatter({ Points: entityPoints, Clusters: CLUSTERS, ColorBy: 'entity', ShowLegend: true });
    expect(text(fixture, '.legend .legend-title')).toBe('Entities');
    const names = queryAll(fixture, '.legend .legend-label').map((l) => l.textContent?.trim());
    expect(names).toContain('Companies');
    expect(names).toContain('Contacts');
  });

  it('renders selection rings for externally-selected points', () => {
    const fixture = renderScatter({
      Points: POINTS,
      Clusters: CLUSTERS,
      SelectedPointIds: new Set<string>(['k1']),
    });
    expect(queryAll(fixture, 'circle.selection-ring').length).toBe(1);
  });
});
