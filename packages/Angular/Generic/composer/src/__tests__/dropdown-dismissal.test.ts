import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Contract spec for dismissing the suggestion dropdown by clicking away.
 *
 * WHY IT EXISTS: dismissal used to rely entirely on the editor's blur, which is not enough.
 * Clicking a non-focusable area (a message list, page background) does not blur a contenteditable,
 * so the dropdown stayed open with nothing able to close it. That was always true for a typed
 * trigger; the Skills button made it easy to reach, because the button deliberately keeps focus in
 * the editor and the user's next click is therefore the first thing that could dismiss it.
 *
 * This is a behaviour change for EVERY trigger ('@', '#', '/'), not just the button, which is
 * exactly why it is pinned here.
 */
describe('MentionEditorComponent — click-away dismissal', () => {
  const ts = readFileSync(
    resolve(__dirname, '../lib/components/mention/mention-editor.component.ts'),
    'utf8'
  );
  const body = ts.slice(ts.indexOf('onDocumentMouseDown('), ts.indexOf('async ngOnInit('));

  it('listens on document mousedown, not click', () => {
    // mousedown fires BEFORE the browser moves focus, so this decides before blur's 200ms timer
    // is involved. On 'click' the two would race and the outcome would depend on timing.
    expect(ts).toContain("@HostListener('document:mousedown', ['$event'])");
    expect(ts).not.toContain("@HostListener('document:click'");
  });

  it('does nothing when no dropdown is open', () => {
    // Otherwise every click in the application pays for a containment check.
    expect(body).toMatch(/if \(!this\.showMentionDropdown\) \{\s*return;/);
  });

  it('leaves clicks INSIDE the component alone, so a suggestion row still selects', () => {
    // The dropdown renders with fixed positioning but stays inside this component's host, so
    // containment covers the rows. Without this, mousedown on a suggestion would close the list
    // before the click could select it — the button would look broken in the most common path.
    expect(body).toContain('this.hostRef.nativeElement.contains(target)');
    expect(body.indexOf('contains(target)')).toBeLessThan(body.indexOf('closeMentionDropdown()'));
  });

  it('closes on a genuine outside press', () => {
    expect(body).toContain('this.closeMentionDropdown();');
  });

  it('injects the host element rather than reaching for the editor child', () => {
    // The editor child does not contain the fixed-positioned dropdown; the host does.
    expect(ts).toContain('private hostRef: ElementRef<HTMLElement>');
  });
});
