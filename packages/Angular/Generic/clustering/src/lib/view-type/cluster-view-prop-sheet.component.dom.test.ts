import { describe, it, expect } from 'vitest';
import { CommonModule } from '@angular/common';
import { ComponentFixture } from '@angular/core/testing';
import { renderComponentFixture, query, queryAll, capture } from '@memberjunction/ng-test-utils';
import { ClusterViewPropSheetComponent } from './cluster-view-prop-sheet.component';

/**
 * DOM-level spec for <mj-cluster-view-prop-sheet>. Module-declared, inline template,
 * no external data — configured via the `config` @Input (an opaque host map). The
 * template uses native [value]/(change), so only CommonModule is needed (for @if).
 */
function renderSheet(config: Record<string, unknown> = {}): ComponentFixture<ClusterViewPropSheetComponent> {
  return renderComponentFixture(ClusterViewPropSheetComponent, {
    imports: [CommonModule],
    declarations: [ClusterViewPropSheetComponent],
    inputs: { config },
  });
}

describe('ClusterViewPropSheetComponent (DOM)', () => {
  it('renders the K (clusters) input when algorithm is kmeans', () => {
    const fixture = renderSheet({ algorithm: 'kmeans' });
    const labels = queryAll(fixture, '.cluster-prop-row span').map((s) => s.textContent?.trim());
    expect(labels).toContain('Clusters (K)');
  });

  it('hides the K input when algorithm is dbscan', () => {
    const fixture = renderSheet({ algorithm: 'dbscan' });
    const labels = queryAll(fixture, '.cluster-prop-row span').map((s) => s.textContent?.trim());
    expect(labels).not.toContain('Clusters (K)');
  });

  it('reflects the algorithm value in the algorithm <select>', () => {
    const fixture = renderSheet({ algorithm: 'dbscan' });
    const algSelect = query(fixture, '.cluster-prop-row select') as HTMLSelectElement;
    expect(algSelect.value).toBe('dbscan');
  });

  it('emits the full config map with the patched algorithm on change', () => {
    const fixture = renderSheet({ algorithm: 'kmeans', k: 4 });
    const changes = capture<Record<string, unknown>>(fixture.componentInstance.configChange);
    const algSelect = query(fixture, '.cluster-prop-row select') as HTMLSelectElement;
    algSelect.value = 'dbscan';
    algSelect.dispatchEvent(new Event('change'));
    expect(changes.length).toBe(1);
    expect(changes[0]['algorithm']).toBe('dbscan');
  });

  it('reflects the nameClusters flag on the checkbox and emits when toggled', () => {
    const fixture = renderSheet({ nameClusters: false });
    const checkbox = query(fixture, 'input[type="checkbox"]') as HTMLInputElement;
    expect(checkbox.checked).toBe(false);

    const changes = capture<Record<string, unknown>>(fixture.componentInstance.configChange);
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));
    expect(changes.length).toBe(1);
    expect(changes[0]['nameClusters']).toBe(true);
  });

  it('emits a patched maxRecords on input', () => {
    const fixture = renderSheet({ maxRecords: 500 });
    const changes = capture<Record<string, unknown>>(fixture.componentInstance.configChange);
    // Max records is the number input that is not the K input (K hidden here is false; kmeans default).
    const numberInputs = queryAll(fixture, 'input[type="number"]') as HTMLInputElement[];
    const maxRecordsInput = numberInputs[numberInputs.length - 1];
    maxRecordsInput.value = '1000';
    maxRecordsInput.dispatchEvent(new Event('input'));
    expect(changes.length).toBe(1);
    expect(changes[0]['maxRecords']).toBe(1000);
  });
});
