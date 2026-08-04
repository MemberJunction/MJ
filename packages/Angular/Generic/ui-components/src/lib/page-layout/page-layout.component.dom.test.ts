import { describe, it, expect } from 'vitest';
import { renderTemplate, query, queryAll } from '@memberjunction/ng-test-utils';
import { MJPageLayoutComponent } from './page-layout.component';

/**
 * DOM coverage for <mj-page-layout> — the outermost page-chrome shell (used ~80×). It is a pure
 * content-projection host, so the meaningful contract is that it renders its projected children
 * (header/body slots the page composes) in order. renderTemplate is used because the value is the
 * projection, not any input.
 */

describe('MJPageLayoutComponent (DOM)', () => {
  it('projects its children in order', async () => {
    const f = await renderTemplate(
      `<mj-page-layout><header class="hdr">H</header><main class="bdy">B</main></mj-page-layout>`,
      { imports: [MJPageLayoutComponent] },
    );
    expect(query(f, '.hdr')).not.toBeNull();
    expect(query(f, '.bdy')).not.toBeNull();
    const kids = queryAll(f, 'mj-page-layout > *').map((e) => e.className);
    expect(kids).toEqual(['hdr', 'bdy']);
  });
});
