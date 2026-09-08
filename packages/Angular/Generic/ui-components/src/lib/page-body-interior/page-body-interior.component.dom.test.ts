import { describe, it, expect } from 'vitest';
import { renderComponentFixture, renderTemplate, query } from '@memberjunction/ng-test-utils';
import { MJPageBodyInteriorComponent } from './page-body-interior.component';

/**
 * DOM coverage for <mj-page-body-interior> — the inner scroll region of the page-chrome body
 * (used ~32×). Like <mj-page-body> it's a content-projection host whose rendered contract is the
 * Padding/Flex/Direction host modifier classes.
 */

const render = (inputs: Record<string, unknown> = {}) =>
  renderComponentFixture(MJPageBodyInteriorComponent, { imports: [MJPageBodyInteriorComponent], inputs });
const host = (f: ReturnType<typeof render>) => f.nativeElement as HTMLElement;

describe('MJPageBodyInteriorComponent (DOM)', () => {
  it('has padding by default', () => {
    expect(host(render()).classList.contains('mj-page-body-interior--no-padding')).toBe(false);
  });

  it('applies --no-padding when Padding is false', () => {
    expect(host(render({ Padding: false })).classList.contains('mj-page-body-interior--no-padding')).toBe(true);
  });

  it('has no --flex class by default', () => {
    expect(host(render()).classList.contains('mj-page-body-interior--flex')).toBe(false);
  });

  it('applies --flex when Flex is true', () => {
    expect(host(render({ Flex: true })).classList.contains('mj-page-body-interior--flex')).toBe(true);
  });

  it('applies --row only when Flex is true and Direction is row', () => {
    expect(host(render({ Direction: 'row' })).classList.contains('mj-page-body-interior--row')).toBe(false);
  });

  it('applies --row when Flex is true and Direction is row', () => {
    expect(host(render({ Flex: true, Direction: 'row' })).classList.contains('mj-page-body-interior--row')).toBe(true);
  });

  it('projects its content', async () => {
    const f = await renderTemplate(`<mj-page-body-interior><p class="inner">x</p></mj-page-body-interior>`, { imports: [MJPageBodyInteriorComponent] });
    expect(query(f, '.inner')).not.toBeNull();
  });
});
