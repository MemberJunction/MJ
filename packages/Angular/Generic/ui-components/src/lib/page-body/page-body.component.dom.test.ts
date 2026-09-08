import { describe, it, expect } from 'vitest';
import { renderComponentFixture, renderTemplate, query } from '@memberjunction/ng-test-utils';
import { MJPageBodyComponent } from './page-body.component';

/**
 * DOM coverage for <mj-page-body> — the page-chrome body wrapper (used ~100×). It's a pure
 * content-projection host whose only rendered contract is a set of host modifier classes derived
 * from its Padding/Flex/Direction inputs. Verifies each class toggle + that content projects.
 */

const render = (inputs: Record<string, unknown> = {}) =>
  renderComponentFixture(MJPageBodyComponent, { imports: [MJPageBodyComponent], inputs });
const host = (f: ReturnType<typeof render>) => f.nativeElement as HTMLElement;

describe('MJPageBodyComponent (DOM)', () => {
  it('has padding by default (no --no-padding class)', () => {
    expect(host(render()).classList.contains('mj-page-body--no-padding')).toBe(false);
  });

  it('applies --no-padding when Padding is false', () => {
    expect(host(render({ Padding: false })).classList.contains('mj-page-body--no-padding')).toBe(true);
  });

  it('has no --flex class by default', () => {
    expect(host(render()).classList.contains('mj-page-body--flex')).toBe(false);
  });

  it('applies --flex when Flex is true', () => {
    expect(host(render({ Flex: true })).classList.contains('mj-page-body--flex')).toBe(true);
  });

  it('applies --row only when Flex is true AND Direction is row', () => {
    // Direction alone (no Flex) must NOT add the row class.
    expect(host(render({ Direction: 'row' })).classList.contains('mj-page-body--row')).toBe(false);
  });

  it('applies --row when Flex is true and Direction is row', () => {
    expect(host(render({ Flex: true, Direction: 'row' })).classList.contains('mj-page-body--row')).toBe(true);
  });

  it('projects its content', async () => {
    const f = await renderTemplate(`<mj-page-body><p class="inner">hi</p></mj-page-body>`, { imports: [MJPageBodyComponent] });
    expect(query(f, '.inner')).not.toBeNull();
  });
});
