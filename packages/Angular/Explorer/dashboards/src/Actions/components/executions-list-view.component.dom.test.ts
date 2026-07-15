import { describe, it, expect } from 'vitest';
import { renderComponentFixture, query, text } from '@memberjunction/ng-test-utils';
import { ExecutionsListViewComponent } from './executions-list-view.component';

/**
 * DOM coverage for <mj-executions-list-view> — currently a "coming soon" placeholder. It owns no
 * inputs and one (as-yet-unwired) openEntityRecord output, so this is a smoke spec: confirm the
 * placeholder chrome renders (icon + heading + description). Module-declared (standalone:false),
 * rendered via declarations with no children or services.
 */
describe('ExecutionsListViewComponent (DOM)', () => {
  const render = () => renderComponentFixture(ExecutionsListViewComponent, { declarations: [ExecutionsListViewComponent] });

  it('renders the placeholder container with its icon', () => {
    const fixture = render();
    expect(query(fixture, '.executions-list-placeholder')).not.toBeNull();
    expect(query(fixture, '.placeholder-content i.fa-list')).not.toBeNull();
  });

  it('renders the heading and coming-soon description', () => {
    const fixture = render();
    expect(text(fixture, '.placeholder-content h3')).toContain('Executions List View');
    expect(text(fixture, '.placeholder-content p')).toContain('coming soon');
  });

  it('exposes an openEntityRecord output that has emitted nothing on load', () => {
    const fixture = render();
    let emitted = false;
    fixture.componentInstance.openEntityRecord.subscribe(() => (emitted = true));
    fixture.detectChanges();
    expect(emitted).toBe(false);
  });
});
