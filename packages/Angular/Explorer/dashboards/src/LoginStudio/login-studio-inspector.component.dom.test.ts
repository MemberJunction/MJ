import { describe, it, expect } from 'vitest';
import { renderComponentFixture, query, queryAll, capture, typeInto } from '@memberjunction/ng-test-utils';
import { DefaultLoginDesign, NewLoginBlock, type LoginBlock } from '@memberjunction/theme-engine';
import { LoginStudioInspectorComponent } from './login-studio-inspector.component';

/**
 * DOM coverage for <mj-login-studio-inspector>: it owns no state, so each test renders a selection and
 * asserts the field shown and the change it asks for.
 */

const render = (inputs: Record<string, unknown>) =>
  renderComponentFixture(LoginStudioInspectorComponent, { inputs: { Design: DefaultLoginDesign(), ...inputs } });

const button = (root: ParentNode, label: string): HTMLElement =>
  Array.from(root.querySelectorAll('button')).find((b) => b.textContent?.trim() === label) as HTMLElement;

describe('LoginStudioInspectorComponent (DOM)', () => {
  it('edits the selected headline', () => {
    const fixture = render({ Selected: NewLoginBlock('headline'), SelectedRegion: 'Banner' });
    const edits = capture(fixture.componentInstance.EditRequested);
    typeInto(fixture, 'input.mj-input', 'Hello');
    expect(edits).toEqual([{ Kind: 'Block', Field: 'Text', Value: 'Hello' }]);
  });

  it('asks for a new width from the width toggle', () => {
    const fixture = render({ Selected: NewLoginBlock('spacer'), SelectedRegion: 'PanelTop' });
    const edits = capture(fixture.componentInstance.EditRequested);
    button(fixture.nativeElement, 'Half').click();
    expect(edits).toContainEqual({ Kind: 'Block', Field: 'Width', Value: 'half' });
  });

  it('shows what stops the selected block from being saved', () => {
    const image: LoginBlock = NewLoginBlock('image');
    const fixture = render({ Selected: image, SelectedRegion: 'Banner' });
    expect(queryAll(fixture, 'mj-alert li').map((li) => li.textContent?.trim())).toContain('The image needs an https:// address.');
  });

  it('offers the stock page only when there is something to remove', () => {
    expect(query(render({ CanReset: false }), '.lsi__row--reset')).toBeNull();
    const fixture = render({ CanReset: true });
    const requests = capture(fixture.componentInstance.StockPageRequested);
    button(fixture.nativeElement, 'Use the stock sign-in page').click();
    expect(requests).toHaveLength(1);
  });
});
