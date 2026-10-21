import { describe, it, expect } from 'vitest';
import { renderComponentFixture, query, queryAll, capture } from '@memberjunction/ng-test-utils';
import type { LoginBlock } from '@memberjunction/theme-engine';
import { MJLoginRegionComponent } from './login-region.component';

/**
 * DOM coverage for <mj-login-region>: the live login screen draws only safe links and images and marks
 * blocks that leave at the stack point; in the editor a block is selectable and keyboard-movable.
 */

const base = { Width: 'full' as const, HideWhenStacked: false };
const blocks: LoginBlock[] = [
  { ...base, ID: 'b-head', Type: 'headline', Text: 'Welcome', Size: 'lg', HideWhenStacked: true },
  { ...base, ID: 'b-links', Type: 'links', Links: [{ Label: 'Privacy', Href: 'https://example.org/p' }, { Label: 'Bad', Href: 'javascript:alert(1)' }] },
  { ...base, ID: 'b-img', Type: 'image', URL: 'javascript:alert(2)', Alt: 'x', Size: 'md' },
];

const render = (inputs: Record<string, unknown>) =>
  renderComponentFixture(MJLoginRegionComponent, { inputs: { Blocks: blocks, Region: 'Banner', ...inputs } });

describe('MJLoginRegionComponent (DOM)', () => {
  it('draws the live blocks, with only safe links and no unsafe image', () => {
    const fixture = render({});
    expect(query(fixture, 'h1.lb-headline')?.textContent).toContain('Welcome');
    const links = queryAll(fixture, '.lb-links a');
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['https://example.org/p']);
    expect(query(fixture, 'img.lb-image')).toBeNull();
  });

  it('marks a block that leaves at the stack point, for the live CSS to hide', () => {
    expect(queryAll(render({}), '.lr__cell--hide-stacked')).toHaveLength(1);
  });

  it('in the editor, a click selects a block and Alt+ArrowUp asks to move it', () => {
    const fixture = render({ Editable: true });
    const selected = capture(fixture.componentInstance.SelectRequested);
    const commands = capture(fixture.componentInstance.CommandRequested);
    const item = queryAll(fixture, '.lr__item')[1] as HTMLElement;
    item.click();
    item.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true, bubbles: true }));
    expect(selected).toEqual(['b-links']);
    expect(commands).toEqual([{ Kind: 'up', ID: 'b-links' }]);
  });

  it('in the editor, shows the selected block\'s toolbar and an empty region\'s drop hint', () => {
    expect(query(render({ Editable: true, SelectedID: 'b-head' }), '.lr__tools')).not.toBeNull();
    expect(query(render({ Editable: true, Blocks: [] }), '.lr__hint')).not.toBeNull();
  });
});
