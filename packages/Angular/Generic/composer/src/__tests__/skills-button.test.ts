import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Contract spec for the composer's Skills button.
 *
 * WHY THE BUTTON EXISTS: `/` skill commands were reachable only by knowing to type `/`. That is
 * not an affordance — nothing on screen says the feature is there. The button is the visible door
 * to the same trigger.
 *
 * Template-source assertions rather than TestBed: `MessageInputBoxComponent` renders a live
 * contenteditable editor with mention plugins, which makes a full render disproportionate for what
 * are placement and wiring guarantees. The behavioural half (that OpenTrigger reuses the typed
 * path) is asserted in the mention editor's own spec.
 */
describe('message-input-box — Skills button', () => {
  const html = readFileSync(
    resolve(__dirname, '../lib/components/message/message-input-box.component.html'),
    'utf8'
  );
  const ts = readFileSync(
    resolve(__dirname, '../lib/components/message/message-input-box.component.ts'),
    'utf8'
  );
  const css = readFileSync(
    resolve(__dirname, '../lib/components/message/message-input-box.component.css'),
    'utf8'
  );

  it('carries the same input/output trio as Plan Mode', () => {
    // Peers in the strip should be peers in the API. A button with a different shape is one a
    // host has to learn separately.
    expect(ts).toContain('@Input() EnableSkills: boolean = false;');
    expect(ts).toContain('@Output() BeforeSkillsOpened = new EventEmitter<BeforeSkillsOpenedEventArgs>();');
    expect(ts).toContain('@Output() AfterSkillsOpened = new EventEmitter<void>();');
  });

  it('joins the strip visibility gate', () => {
    // Without this the button cannot be the ONLY control in the strip — a composer with skills
    // but no attachments, voice or plan mode would render nothing.
    const gate = html.match(/@if \(EnableAttachments \|\| EnableRealtime \|\| EnablePlanMode[^)]*\)/);
    expect(gate).not.toBeNull();
    expect(gate![0]).toContain('EnableSkills');
  });

  it('renders with the stock icon-button chrome and a pressed state', () => {
    expect(html).toContain('class="attach-button-icon skills-button-icon"');
    expect(html).toContain('[class.skills-button-icon--active]="SkillsActive"');
    // Disclosure semantics, NOT toggle semantics. Plan Mode beside it is a mode that stays on, so
    // aria-pressed is right there; this opens a popup, and announcing "pressed" for revealing a
    // list is simply the wrong thing for a screen reader to say.
    expect(html).toContain('[attr.aria-expanded]="SkillsActive"');
    expect(html).toContain('aria-haspopup="true"');
    expect(html).not.toContain('[attr.aria-pressed]="SkillsActive"');
    expect(html).toContain('[disabled]="Disabled"');
  });

  it('names the keyboard route in its tooltip', () => {
    // The button exists because `/` is undiscoverable; the tooltip is where someone learns the
    // shortcut and stops needing the button.
    expect(html).toMatch(/title="Skills[^"]*\/[^"]*"/);
  });

  it('derives its pressed state from the editor rather than taking a dead input', () => {
    // Plan Mode's active state is a host-owned preference threaded down. "Is the skill dropdown
    // open" is intrinsic to the composer, so an @Input would be unanswerable by a host and would
    // leave the button permanently unpressed if nobody bound it.
    expect(ts).toContain('get SkillsActive(): boolean');
    expect(ts).toContain("this.mentionEditor?.IsTriggerOpen('/')");
    expect(ts).not.toContain('@Input() SkillsActive');
  });

  it('ships the veto as a Before/After pair, and skips After when canceled', () => {
    // UI_LAYERING_GUIDE section 6 rule 1: an action a host might veto is a pair, and After* must
    // NOT fire on the canceled path. Hosts rely on that.
    const body = ts.slice(ts.indexOf('OnSkillsClick()'), ts.indexOf('OnRealtimeClick()'));
    expect(body).toContain('this.BeforeSkillsOpened.emit(args);');
    expect(body).toMatch(/if \(args\.Cancel\) \{\s*return;/);
    expect(body.indexOf('args.Cancel')).toBeLessThan(body.indexOf('AfterSkillsOpened'));
  });

  it('toggles closed on a second click', () => {
    // aria-pressed promises a toggle. Without this the second click re-ran the open path,
    // re-emitting the Before/After pair and re-capturing the trigger baseline at the new caret.
    const body = ts.slice(ts.indexOf('OnSkillsClick()'), ts.indexOf('OnRealtimeClick()'));
    expect(body).toMatch(/if \(this\.SkillsActive\) \{[\s\S]*?closeMentionDropdown\(\);[\s\S]*?return;/);
    // and it must bail BEFORE emitting, or the counts are still wrong
    expect(body.indexOf('this.SkillsActive')).toBeLessThan(body.indexOf('BeforeSkillsOpened.emit'));
  });

  it('opens the trigger rather than duplicating the menu', () => {
    // Routing through OpenTrigger('/') is what keeps permission filtering, per-skill icons and
    // chip insertion in one implementation instead of two that can disagree.
    expect(ts).toContain("this.mentionEditor?.OpenTrigger('/')");
    expect(ts).toContain('this.AfterSkillsOpened.emit();');
  });

  it('emits After only when the trigger actually opened', () => {
    const body = ts.slice(ts.indexOf('OnSkillsClick()'), ts.indexOf('OnRealtimeClick()'));
    expect(body).toMatch(/if \(this\.mentionEditor\?\.OpenTrigger\('\/'\)\) \{\s*this\.AfterSkillsOpened\.emit\(\);/);
  });

  it('reuses Plan Mode’s active treatment', () => {
    // Peers in the strip: a different active colour would read as a different kind of control.
    expect(css).toContain('.skills-button-icon--active:not(:disabled)');
    expect(css).toContain('.plan-mode-button-icon--active:not(:disabled)');
  });
});
