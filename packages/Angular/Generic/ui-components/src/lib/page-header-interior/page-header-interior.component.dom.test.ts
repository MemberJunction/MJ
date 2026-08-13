import { describe, it, expect } from 'vitest';
import { renderComponentFixture, renderTemplate, query, text } from '@memberjunction/ng-test-utils';
import { MJPageHeaderInteriorComponent } from './page-header-interior.component';

/**
 * DOM coverage for <mj-page-header-interior> — the two-row sub-page header card (used ~50×). Verifies
 * the input-gated Title/Subtitle, the [meta]/[actions]/[toolbar] projection slots, and the a11y
 * role/aria-label on the card (default role 'search', overridable/removable).
 */

const render = (inputs: Record<string, unknown> = {}) =>
  renderComponentFixture(MJPageHeaderInteriorComponent, { imports: [MJPageHeaderInteriorComponent], inputs });
const card = (f: ReturnType<typeof render>) => query(f, '.mj-page-header-interior');

describe('MJPageHeaderInteriorComponent (DOM)', () => {
  it('renders the Title and Subtitle when provided', () => {
    const f = render({ Title: 'Runtime', Subtitle: 'Read-only snapshot' });
    expect(text(f, '.mj-page-header-interior__title')).toBe('Runtime');
    expect(text(f, '.mj-page-header-interior__subtitle')).toBe('Read-only snapshot');
  });

  it('omits the Title element when Title is unset', () => {
    const f = render({ Subtitle: 'only a subtitle' });
    expect(query(f, '.mj-page-header-interior__title')).toBeNull();
    expect(query(f, '.mj-page-header-interior__subtitle')).not.toBeNull();
  });

  it('defaults the card role to "search"', () => {
    expect(card(render())?.getAttribute('role')).toBe('search');
  });

  it('honors an explicit Role and AriaLabel', () => {
    const f = render({ Role: 'region', AriaLabel: 'Filters' });
    expect(card(f)?.getAttribute('role')).toBe('region');
    expect(card(f)?.getAttribute('aria-label')).toBe('Filters');
  });

  it('removes the role when Role is null', () => {
    expect(card(render({ Role: null }))?.getAttribute('role')).toBeNull();
  });

  it('projects the [meta], [actions] and [toolbar] slots into their rows', async () => {
    const f = await renderTemplate(
      `<mj-page-header-interior Title="T">
         <span meta class="m">meta</span>
         <button actions class="a">act</button>
         <div toolbar class="t">tools</div>
       </mj-page-header-interior>`,
      { imports: [MJPageHeaderInteriorComponent] },
    );
    expect(query(f, '.mj-page-header-interior__identity .m')).not.toBeNull();
    expect(query(f, '.mj-page-header-interior__actions .a')).not.toBeNull();
    expect(query(f, '.mj-page-header-interior__row--toolbar .t')).not.toBeNull();
  });
});
