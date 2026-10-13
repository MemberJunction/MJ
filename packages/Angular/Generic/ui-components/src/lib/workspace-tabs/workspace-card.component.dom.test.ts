import { describe, it, expect } from 'vitest';
import { renderComponentFixture, query, queryAll, text, attr, click, capture } from '@memberjunction/ng-test-utils';
import { MJWorkspaceCardComponent } from './workspace-card.component';
import { MJWorkspaceTab } from './workspace-tabs.types';

/**
 * DOM spec for <mj-workspace-card> — the thin slotted frame every workspace screen shares. It owns
 * the card surface, the delegated `<mj-workspace-tab-strip>`, and the opt-in standardized footer
 * (confirm / save-as-draft / discard). Covers: the `aria-label` on the card surface, the
 * `@if (ShowFooter)` / `@if (ShowDraft)` footer gating, the per-workshop `ConfirmLabel` /
 * `ConfirmBusy` states, the `Confirm` / `SaveDraft` / `Discard` outputs, and that the tab-strip
 * outputs (`TabSelected` etc.) are forwarded up through the card.
 */
describe('MJWorkspaceCardComponent (DOM)', () => {
  type Fix = ReturnType<typeof renderComponentFixture<MJWorkspaceCardComponent>>;

  const tab = (over: Partial<MJWorkspaceTab>): MJWorkspaceTab =>
    ({ Id: 'a', Label: 'Alpha', Status: 'draft', State: null, ...over });

  const render = (inputs: Record<string, unknown> = {}): Fix =>
    renderComponentFixture(MJWorkspaceCardComponent, { inputs });

  it('labels the card surface with AriaLabel', () => {
    const f = render({ AriaLabel: 'Journal entries' });
    expect(attr(f, '.ws-card', 'aria-label')).toBe('Journal entries');
  });

  it('hides the standardized footer unless ShowFooter is set', () => {
    const f = render();
    expect(query(f, '.ws-card__foot')).toBeNull();
  });

  it('renders the footer with the per-workshop ConfirmLabel when ShowFooter is set', () => {
    const f = render({ ShowFooter: true, ConfirmLabel: 'Create entry' });
    expect(query(f, '.ws-card__foot')).not.toBeNull();
    expect(text(f, '.ws-card__foot button[variant="primary"]')).toContain('Create entry');
  });

  it('swaps the confirm label for the busy label while ConfirmBusy is true', () => {
    const f = render({ ShowFooter: true, ConfirmLabel: 'Create entry', ConfirmBusy: true, ConfirmBusyLabel: 'Saving…' });
    const confirm = text(f, '.ws-card__foot button[variant="primary"]');
    expect(confirm).toContain('Saving…');
    expect(confirm).not.toContain('Create entry');
  });

  it('emits Confirm, SaveDraft and Discard from the three footer verbs', () => {
    const f = render({ ShowFooter: true });
    const confirm = capture(f.componentInstance.Confirm);
    const draft = capture(f.componentInstance.SaveDraft);
    const discard = capture(f.componentInstance.Discard);
    click(f, '.ws-card__foot button[variant="primary"]');
    click(f, '.ws-card__foot button[variant="outline"]'); // save-as-draft
    click(f, '.ws-card__foot button[variant="flat"]');     // discard
    expect(confirm.length).toBe(1);
    expect(draft.length).toBe(1);
    expect(discard.length).toBe(1);
  });

  it('omits the save-as-draft verb when ShowDraft is false', () => {
    const f = render({ ShowFooter: true, ShowDraft: false });
    expect(queryAll(f, '.ws-card__foot button[variant="outline"]').length).toBe(0);
  });

  it('forwards TabSelected up from the embedded tab strip', () => {
    const f = render({ Tabs: [tab({ Id: 'a' }), tab({ Id: 'b', Label: 'Beta' })], ActiveId: 'a' });
    const selected = capture(f.componentInstance.TabSelected);
    (queryAll(f, '.mj-tabs__tab')[1] as HTMLElement).click();
    expect(selected).toEqual(['b']);
  });

  it('forwards NewTabRequested up from the embedded tab strip', () => {
    const f = render({ Tabs: [tab({ Id: 'a' })] });
    const requested = capture(f.componentInstance.NewTabRequested);
    click(f, '.mj-tabs__new');
    expect(requested.length).toBe(1);
  });
});
