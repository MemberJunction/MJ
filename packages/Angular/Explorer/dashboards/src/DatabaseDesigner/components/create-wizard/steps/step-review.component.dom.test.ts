import { describe, it, expect } from 'vitest';
import { Component, Input } from '@angular/core';
import { MJAlertComponent } from '@memberjunction/ng-ui-components';
import { renderComponentFixture, query, queryAll, text } from '@memberjunction/ng-test-utils';
import { StepReviewComponent } from './step-review.component';

/**
 * DOM coverage for <mj-entity-step-review> (OnPush) — the wizard review step's banner/gating logic:
 * a validating banner, an error banner listing each ValidationError, and the optional description.
 * The heavy review-panel + markdown children are stubbed; the real mj-alert is imported (its success
 * variant only shows for a fully-valid spec, out of scope here). Single synchronous render.
 */

@Component({ standalone: true, selector: 'mj-database-review-panel', template: '' })
class ReviewPanelStub {
  @Input() TableDefinition: unknown;
  @Input() ModificationType = '';
}
@Component({ standalone: true, selector: 'mj-markdown', template: '' })
class MarkdownStub {
  @Input() data = '';
}

const render = (inputs: Record<string, unknown>) =>
  renderComponentFixture(StepReviewComponent, {
    imports: [MJAlertComponent, ReviewPanelStub, MarkdownStub],
    declarations: [StepReviewComponent],
    inputs: { TableDefinition: {}, ValidationErrors: [], IsValidating: false, ...inputs },
  });

describe('StepReviewComponent (DOM)', () => {
  it('shows the validating banner while IsValidating is true', () => {
    const fixture = render({ IsValidating: true });
    const banner = query(fixture, '.step-banner-validating');
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain('Validating schema');
  });

  it('lists one error row per ValidationError', () => {
    const fixture = render({ ValidationErrors: ['Name is required', 'Duplicate field'] });
    expect(query(fixture, '.step-banner-error')).not.toBeNull();
    const items = queryAll(fixture, '.banner-err-item').map((e) => e.textContent?.trim());
    expect(items.length).toBe(2);
    expect(items[0]).toContain('Name is required');
  });

  it('shows the description when the table definition has one', () => {
    const fixture = render({ TableDefinition: { Description: 'Stores members' } });
    expect(text(fixture, '.entity-description')).toContain('Stores members');
  });

  it('always renders the review panel child', () => {
    expect(query(render({}), 'mj-database-review-panel')).not.toBeNull();
  });
});
