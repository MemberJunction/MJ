import { describe, it, expect } from 'vitest';
import { Component, Input } from '@angular/core';
import { renderComponentFixture, query, queryAll } from '@memberjunction/ng-test-utils';
import { MJTabListDirective, MJTabListRequest } from './tab-list.directive';

/**
 * The ARIA tabs keyboard contract, asserted once — this directive is the reason `mj-tabstrip` and
 * the draft/workspace strip cannot have DIFFERENT keyboard behaviour, so it is the right place to
 * pin that behaviour rather than testing it twice at the strip level.
 *
 * Deliberately hosted on a minimal, made-up markup shape rather than on either real strip: the
 * whole claim is that the directive works on any DOM that marks tabs with `role="tab"`.
 */
@Component({
  standalone: true,
  imports: [MJTabListDirective],
  template: `
    <div mjTabList (TabActivateRequested)="Activated.push($event)" (TabCloseRequested)="Closed.push($event)">
      @for (t of Tabs; track t) {
        <div role="tab" [attr.aria-selected]="t === Selected" [attr.data-id]="t">{{ t }}</div>
      }
    </div>
  `,
})
class TabListHostComponent {
  // Inputs, not plain fields: the harness runs ZONELESS, where mutating a field does not mark the
  // view dirty and a later detectChanges() would render nothing. `setInput` is the supported way to
  // change state mid-test.
  @Input() Tabs: string[] = ['a', 'b', 'c'];
  @Input() Selected = 'a';
  public Activated: MJTabListRequest[] = [];
  public Closed: MJTabListRequest[] = [];
}

const render = () => renderComponentFixture(TabListHostComponent, { imports: [TabListHostComponent] });
const tabs = (f: ReturnType<typeof render>) => queryAll(f, '[role="tab"]') as HTMLElement[];
const press = (el: HTMLElement, key: string) =>
  el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
/** Change host state the zoneless-correct way, then render. */
const select = (f: ReturnType<typeof render>, value: string) => {
  f.componentRef.setInput('Selected', value);
  f.detectChanges();
};

describe('mjTabList — the shared ARIA tabs contract', () => {
  it('marks the container as a tablist without the host having to', () => {
    expect((query(render(), '[mjTabList]') as HTMLElement).getAttribute('role')).toBe('tablist');
  });

  it('puts exactly ONE tab in the page tab order — the selected one', () => {
    const t = tabs(render());
    expect(t.map((x) => x.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);
  });

  it('never leaves the strip a keyboard dead end when nothing is selected', () => {
    const f = render();
    select(f, 'none-of-them');
    // Sanity-check the premise: nothing is selected any more.
    expect(tabs(f).map((x) => x.getAttribute('aria-selected'))).toEqual(['false', 'false', 'false']);
    // Falls back to the first tab; a list where every tab is -1 could not be entered at all.
    expect(tabs(f).map((x) => x.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);
  });

  it('ArrowRight moves to the next tab, activates it, and MOVES FOCUS there', () => {
    const f = render();
    const t = tabs(f);
    t[0].focus();

    press(t[0], 'ArrowRight');

    expect(f.componentInstance.Activated.map((r) => r.Index)).toEqual([1]);
    expect(document.activeElement).toBe(t[1]);
  });

  it('wraps at both ends rather than dead-ending', () => {
    const f = render();
    const t = tabs(f);

    press(t[0], 'ArrowLeft');
    expect(f.componentInstance.Activated.at(-1)!.Index).toBe(2);

    press(t[2], 'ArrowRight');
    expect(f.componentInstance.Activated.at(-1)!.Index).toBe(0);
  });

  it('Home and End jump to the ends', () => {
    const f = render();
    const t = tabs(f);

    press(t[1], 'End');
    expect(f.componentInstance.Activated.at(-1)!.Index).toBe(2);

    press(t[1], 'Home');
    expect(f.componentInstance.Activated.at(-1)!.Index).toBe(0);
  });

  it('Enter and Space activate the focused tab', () => {
    const f = render();
    const t = tabs(f);

    press(t[2], 'Enter');
    press(t[1], ' ');

    expect(f.componentInstance.Activated.map((r) => r.Index)).toEqual([2, 1]);
  });

  it('Delete and Backspace request closure — the APG gesture for a closeable tab', () => {
    const f = render();
    const t = tabs(f);

    press(t[1], 'Delete');
    press(t[2], 'Backspace');

    expect(f.componentInstance.Closed.map((r) => r.Index)).toEqual([1, 2]);
    // Closing is a different intent from activating; it must not also select.
    expect(f.componentInstance.Activated).toHaveLength(0);
  });

  it('re-points the tab order when the selection moves, without the host managing tabindex', () => {
    const f = render();
    select(f, 'c');

    // Synchronous with the render that moved the selection — a tab order that lagged a frame behind
    // would put Tab focus on the previously-selected tab.
    expect(tabs(f).map((x) => x.getAttribute('tabindex'))).toEqual(['-1', '-1', '0']);
  });

  it('ignores keys from controls that merely sit inside the tablist', () => {
    const f = render();
    const stray = document.createElement('input');
    (query(f, '[mjTabList]') as HTMLElement).appendChild(stray);

    press(stray, 'ArrowRight');

    // A text input's own caret movement must survive being nested in a tablist.
    expect(f.componentInstance.Activated).toHaveLength(0);
  });

  it('carries the tab element, so a host may key off data rather than position', () => {
    const f = render();
    press(tabs(f)[0], 'ArrowRight');
    expect(f.componentInstance.Activated[0].Element.getAttribute('data-id')).toBe('b');
  });

  it('SKIPS hidden tabs when arrowing, but reports the index within the FULL list', () => {
    // Entity Actions hides tabs until the record is saved; arrowing onto one used to make the
    // strip throw. The reported Index must still count hidden tabs or an index-addressed host
    // selects the wrong tab.
    const f = render();
    const t = tabs(f);
    t[1].style.display = 'none';

    press(t[0], 'ArrowRight');

    expect(f.componentInstance.Activated[0].Element.getAttribute('data-id')).toBe('c');
    expect(f.componentInstance.Activated[0].Index).toBe(2);
  });

  it('moves the roving stop off a hidden selected tab so the strip stays reachable', async () => {
    const f = render();
    tabs(f)[0].style.display = 'none'; // 'a' is selected AND hidden
    f.detectChanges(false);
    await new Promise<void>((r) => setTimeout(r, 0));

    expect(tabs(f).map((x) => x.getAttribute('tabindex'))).toEqual(['-1', '0', '-1']);
  });

  it('leaves keys alone inside editable content projected into a tab', () => {
    const f = render();
    const input = document.createElement('input');
    tabs(f)[0].appendChild(input);

    press(input, 'Backspace');
    press(input, 'ArrowRight');

    expect(f.componentInstance.Closed).toHaveLength(0);
    expect(f.componentInstance.Activated).toHaveLength(0);
  });
});
