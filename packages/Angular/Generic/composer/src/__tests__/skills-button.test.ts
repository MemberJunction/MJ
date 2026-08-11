import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * The few Skills-button facts a rendered test cannot observe.
 *
 * Everything BEHAVIOURAL lives in `../lib/components/message/skills-button-toggle.dom.test.ts`,
 * deliberately. This file used to assert the toggle, the event pair and the trigger call as source
 * text, and all of it passed while the toggle was dead code in a real browser: the shape was right
 * and only the integration was broken (@MattC-BC on #3731). Source-text assertions are kept here
 * only where there is nothing to render — a stylesheet rule, and a comment-free structural claim.
 */
describe('message-input-box — Skills button, non-observable facts', () => {
  const css = readFileSync(
    resolve(__dirname, '../lib/components/message/message-input-box.component.css'),
    'utf8'
  );
  const html = readFileSync(
    resolve(__dirname, '../lib/components/message/message-input-box.component.html'),
    'utf8'
  );

  it('reuses Plan Mode’s active treatment rather than inventing its own', () => {
    // Peers in the strip: a different active colour would read as a different kind of control.
    // Not observable in jsdom, which does not apply component stylesheets.
    expect(css).toContain('.skills-button-icon--active:not(:disabled)');
    expect(css).toContain('.plan-mode-button-icon--active:not(:disabled)');
  });

  it('names the keyboard route in its tooltip', () => {
    // The button exists because `/` is undiscoverable; the tooltip is where someone learns the
    // shortcut and stops needing the button.
    expect(html).toMatch(/title="Skills[^"]*\/[^"]*"/);
  });

  it('stops mousedown propagation as well as its default', () => {
    // BOTH halves are load-bearing and the pairing is easy to half-remove in a refactor:
    // preventDefault keeps focus in the editor, stopPropagation keeps the editor's click-away
    // listener from treating a press on this sibling button as an outside press. The consequence
    // is covered behaviourally by the toggle spec; this pins the pairing itself.
    expect(html).toContain('(mousedown)="$event.preventDefault(); $event.stopPropagation()"');
  });
});
