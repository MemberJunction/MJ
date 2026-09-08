import { describe, it, expect } from 'vitest';
import { renderComponentFixture, renderTemplate, query, text } from '@memberjunction/ng-test-utils';
import { MJLeftNavContentComponent } from './left-nav-content.component';

/**
 * DOM coverage for <mj-left-nav-content> — the left-nav content pane (used ~11×). Presentational:
 * it shows a role="alert" error state, else a role="status" loading state, and always projects its
 * content; a host --busy / aria-busy flag reflects loading-or-error.
 */

const render = (inputs: Record<string, unknown> = {}) =>
  renderComponentFixture(MJLeftNavContentComponent, { imports: [MJLeftNavContentComponent], inputs });
const host = (f: ReturnType<typeof render>) => f.nativeElement as HTMLElement;

describe('MJLeftNavContentComponent (DOM)', () => {
  it('shows neither error nor loading, and is not busy, by default', () => {
    const f = render();
    expect(query(f, '.mj-left-nav-content__error')).toBeNull();
    expect(query(f, '.mj-left-nav-content__loading')).toBeNull();
    expect(host(f).classList.contains('mj-left-nav-content--busy')).toBe(false);
    // Angular drops a falsy attr binding, so aria-busy is absent (not "false") when idle.
    expect(host(f).getAttribute('aria-busy')).toBeNull();
  });

  it('shows the loading state (role=status) with the label when Loading', () => {
    const f = render({ Loading: true, LoadingLabel: 'Fetching…' });
    const loading = query(f, '.mj-left-nav-content__loading');
    expect(loading?.getAttribute('role')).toBe('status');
    expect(text(f, '.mj-left-nav-content__loading')).toContain('Fetching…');
    expect(host(f).classList.contains('mj-left-nav-content--busy')).toBe(true);
  });

  it('shows the error state (role=alert) and takes precedence over loading', () => {
    const f = render({ Error: 'Boom', Loading: true });
    const err = query(f, '.mj-left-nav-content__error');
    expect(err?.getAttribute('role')).toBe('alert');
    expect(text(f, '.mj-left-nav-content__error')).toContain('Boom');
    // Error wins the @if/@else-if — the loading block is not rendered.
    expect(query(f, '.mj-left-nav-content__loading')).toBeNull();
  });

  it('always projects its content', async () => {
    const f = await renderTemplate(`<mj-left-nav-content><section class="pane">body</section></mj-left-nav-content>`, { imports: [MJLeftNavContentComponent] });
    expect(query(f, '.pane')).not.toBeNull();
  });
});
