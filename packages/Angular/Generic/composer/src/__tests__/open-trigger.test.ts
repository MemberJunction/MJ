import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Contract spec for `MentionEditorComponent.OpenTrigger` — the seam that lets a trigger have a
 * button as well as a keystroke.
 *
 * The load-bearing property is that it goes through the SAME path as typing. Opening the dropdown
 * directly would leave `mentionStartIndex` / `activeTrigger` unset, and the first selection would
 * then insert the chip in the wrong place — a bug that only shows up on the button path, which is
 * exactly the kind that ships.
 */
describe('MentionEditorComponent — OpenTrigger', () => {
  const ts = readFileSync(
    resolve(__dirname, '../lib/components/mention/mention-editor.component.ts'),
    'utf8'
  );
  const body = ts.slice(ts.indexOf('public OpenTrigger('), ts.indexOf('/** True when keyboard focus currently sits inside this editor. */'));

  it('is public and returns a success boolean', () => {
    expect(ts).toContain('public OpenTrigger(triggerChar: string): boolean');
  });

  it('refuses when disabled, unavailable, or the char has no active provider', () => {
    expect(body).toContain('this.disabled');
    expect(body).toContain('this.mentionTriggers.includes(triggerChar)');
    // Each guard returns false rather than throwing — a button that cannot open should be inert,
    // not an error surface.
    expect((body.match(/return false;/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it('writes NOTHING into the editor', () => {
    // The whole point of the virtual trigger. An earlier version inserted the character to reuse
    // the typed path and stripped it on dismissal, but a character the user never typed appearing
    // and then vanishing is churn in their own message.
    expect(body).not.toContain('createTextNode');
    expect(body).not.toContain('insertNode');
    expect(body).toContain('this.virtualTriggerOpen = true;');
    expect(body).toContain("void this.fetchSuggestions(triggerChar, '');");
  });

  it('captures a baseline so the query and the chip deletion have an anchor', () => {
    // With no trigger char in the text, nothing else can measure where the query starts.
    expect(body).toContain('this.virtualTriggerBaseline =');
  });

  it('does not use the deprecated execCommand', () => {
    // Matches the CALL form, not the bare word: the implementation comment names execCommand to
    // explain why it is avoided, and asserting on prose makes a passing test fail on its own
    // documentation.
    expect(body).not.toContain('execCommand(');
  });

  it('focuses the editor so typing filters the list it just opened', () => {
    expect(body).toContain('this.FocusCaretAtEnd()');
  });
});
