import { describe, it, expect } from 'vitest';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ComponentFixture } from '@angular/core/testing';
import { renderComponentFixture, query, queryAll, hasClass, click, capture } from '@memberjunction/ng-test-utils';
import { ClusterConfigPanelComponent } from './cluster-config-panel.component';
import { ClusterConfig, ClusterMetrics, ClusterConfigPanelEntityOption } from './clustering.types';

/**
 * DOM-level spec for <mj-cluster-config-panel>. It's a module-declared (standalone:false)
 * component configured via @Inputs, so we render via renderComponentFixture with
 * declarations + CommonModule/FormsModule (needed for ngModel + @if/@for).
 */
function renderPanel(inputs: Record<string, unknown> = {}): ComponentFixture<ClusterConfigPanelComponent> {
  return renderComponentFixture(ClusterConfigPanelComponent, {
    imports: [CommonModule, FormsModule],
    declarations: [ClusterConfigPanelComponent],
    inputs,
  });
}

const ENTITY_OPTIONS: ClusterConfigPanelEntityOption[] = [{ Name: 'Companies' }, { Name: 'Contacts' }, { Name: 'Deals' }];

describe('ClusterConfigPanelComponent (DOM)', () => {
  it('renders the entity options into the entity <select>', () => {
    const fixture = renderPanel({ EntityOptions: ENTITY_OPTIONS });
    // First form-group is the entity picker.
    const options = queryAll(fixture, '.form-group select option');
    const names = options.slice(0, 3).map((o) => o.textContent?.trim());
    expect(names).toEqual(['Companies', 'Contacts', 'Deals']);
  });

  it('filters the entity options by AvailableEntities', () => {
    const fixture = renderPanel({ EntityOptions: ENTITY_OPTIONS, AvailableEntities: ['Contacts'] });
    const firstSelectOptions = queryAll(fixture, '.form-group select option');
    expect(firstSelectOptions.map((o) => o.textContent?.trim())).toContain('Contacts');
    expect(firstSelectOptions.map((o) => o.textContent?.trim())).not.toContain('Companies');
  });

  it('shows the K-Means cluster slider by default and hides DBSCAN MinPoints', () => {
    const fixture = renderPanel({ EntityOptions: ENTITY_OPTIONS });
    // K label is present (K-Means default), Min Points label is not.
    const labels = queryAll(fixture, 'label').map((l) => l.textContent?.trim() ?? '');
    expect(labels.some((l) => l === 'Algorithm')).toBe(true);
    expect(labels.some((l) => l.startsWith('Clusters (K)'))).toBe(true);
    expect(labels.some((l) => l.startsWith('Min Points'))).toBe(false);
  });

  it('switches to DBSCAN sliders when the algorithm is dbscan', () => {
    const fixture = renderPanel({ EntityOptions: ENTITY_OPTIONS, DefaultAlgorithm: 'dbscan' });
    const labels = queryAll(fixture, 'label').map((l) => l.textContent?.trim() ?? '');
    expect(labels.some((l) => l.startsWith('Epsilon'))).toBe(true);
    expect(labels.some((l) => l.startsWith('Min Points'))).toBe(true);
    expect(labels.some((l) => l.startsWith('Clusters (K)'))).toBe(false);
  });

  it('disables the Run button when no entity is selectable', () => {
    const fixture = renderPanel({ EntityOptions: [] });
    const runBtn = query(fixture, 'button.run-btn') as HTMLButtonElement;
    expect(runBtn.disabled).toBe(true);
  });

  it('enables the Run button once an entity is available (auto-selected)', () => {
    const fixture = renderPanel({ EntityOptions: ENTITY_OPTIONS });
    const runBtn = query(fixture, 'button.run-btn') as HTMLButtonElement;
    expect(runBtn.disabled).toBe(false);
  });

  it('shows the spinner + "Running..." text and disables Run while IsRunning', () => {
    const fixture = renderPanel({ EntityOptions: ENTITY_OPTIONS, IsRunning: true });
    const runBtn = query(fixture, 'button.run-btn') as HTMLButtonElement;
    expect(runBtn.disabled).toBe(true);
    expect(runBtn.textContent).toContain('Running...');
    expect(query(fixture, 'button.run-btn .fa-spinner')).not.toBeNull();
  });

  it('emits RunClustering with a config snapshot when Run is clicked', () => {
    const fixture = renderPanel({ EntityOptions: ENTITY_OPTIONS });
    const runs = capture<ClusterConfig>(fixture.componentInstance.RunClustering);
    click(fixture, 'button.run-btn');
    expect(runs.length).toBe(1);
    expect(runs[0].EntityName).toBe('Companies');
  });

  it('fires BeforeRunClustering and suppresses RunClustering when canceled', () => {
    const fixture = renderPanel({ EntityOptions: ENTITY_OPTIONS });
    fixture.componentInstance.BeforeRunClustering.subscribe((e) => (e.Cancel = true));
    const runs = capture<ClusterConfig>(fixture.componentInstance.RunClustering);
    click(fixture, 'button.run-btn');
    expect(runs.length).toBe(0);
  });

  it('collapses the body when the chevron is clicked', () => {
    const fixture = renderPanel({ EntityOptions: ENTITY_OPTIONS });
    expect(query(fixture, 'button.run-btn')).not.toBeNull();
    click(fixture, '.header-actions .fa-solid');
    fixture.detectChanges();
    // Body is gated by @if (IsExpanded) — collapsing removes the run button from the DOM.
    expect(query(fixture, 'button.run-btn')).toBeNull();
  });

  it('renders the metrics section when Metrics has records, with a "good" silhouette class', () => {
    const metrics: ClusterMetrics = {
      SilhouetteScore: 0.72,
      ClusterCount: 4,
      ComputationTimeMs: 1200,
      RecordCount: 350,
      OutlierCount: 0,
    };
    const fixture = renderPanel({ EntityOptions: ENTITY_OPTIONS, Metrics: metrics });
    const section = query(fixture, '.metrics-section');
    expect(section).not.toBeNull();
    expect(section?.textContent).toContain('0.72');
    expect(section?.textContent).toContain('1.2s');
    expect(hasClass(fixture, '.metric-value.good', 'good')).toBe(true);
  });

  it('does not render the metrics section when there are no records', () => {
    const fixture = renderPanel({ EntityOptions: ENTITY_OPTIONS, Metrics: null });
    expect(query(fixture, '.metrics-section')).toBeNull();
  });

  it('shows the Save button only when there are results to save', () => {
    const metrics: ClusterMetrics = {
      SilhouetteScore: 0.4,
      ClusterCount: 3,
      ComputationTimeMs: 400,
      RecordCount: 100,
      OutlierCount: 2,
    };
    const fixture = renderPanel({ EntityOptions: ENTITY_OPTIONS, Metrics: metrics, ShowSaveButton: true });
    expect(query(fixture, 'button.save-btn')).not.toBeNull();

    const saves = capture<void>(fixture.componentInstance.SaveVisualization);
    click(fixture, 'button.save-btn');
    expect(saves.length).toBe(1);
  });

  it('hides the algorithm picker when ShowAlgorithmPicker is false', () => {
    const fixture = renderPanel({ EntityOptions: ENTITY_OPTIONS, ShowAlgorithmPicker: false });
    const labels = queryAll(fixture, 'label').map((l) => l.textContent?.trim() ?? '');
    expect(labels.some((l) => l === 'Algorithm')).toBe(false);
  });

  it('moves the active dimension segmented-button when 3D is clicked (SetDimensions)', () => {
    const fixture = renderPanel({ EntityOptions: ENTITY_OPTIONS });
    const segs = queryAll(fixture, 'button.seg-btn').filter((b) => ['2D', '3D'].includes(b.textContent?.trim() ?? ''));
    const [twoD, threeD] = segs as HTMLButtonElement[];
    expect(twoD.classList.contains('active')).toBe(true); // default 2D
    expect(threeD.classList.contains('active')).toBe(false);
    threeD.click(); // SetDimensions(3)
    fixture.detectChanges();
    expect(threeD.classList.contains('active')).toBe(true);
    expect(twoD.classList.contains('active')).toBe(false);
  });

  it('moves the active color-by segmented-button when Entity is clicked (SetColorBy)', () => {
    const fixture = renderPanel({ EntityOptions: ENTITY_OPTIONS });
    const segs = queryAll(fixture, 'button.seg-btn').filter((b) => ['Cluster', 'Entity'].includes(b.textContent?.trim() ?? ''));
    const [cluster, entity] = segs as HTMLButtonElement[];
    expect(cluster.classList.contains('active')).toBe(true); // default cluster
    entity.click(); // SetColorBy('entity')
    fixture.detectChanges();
    expect(entity.classList.contains('active')).toBe(true);
    expect(cluster.classList.contains('active')).toBe(false);
  });
});
