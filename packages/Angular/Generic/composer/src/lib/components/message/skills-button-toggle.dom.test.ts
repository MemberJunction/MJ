import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Component, Input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { MJEmptyStateComponent } from '@memberjunction/ng-ui-components';
import { MessageInputBoxComponent } from './message-input-box.component';
import { MentionEditorComponent } from '../mention/mention-editor.component';
import { MentionDropdownComponent } from '../mention/mention-dropdown.component';
import { ComposerTriggerProvider } from '../../composer-trigger-provider';
import type { ComposerSuggestionRequest, MentionSuggestion } from '../../composer-trigger-provider';

/**
 * INTEGRATED behaviour of the Skills button, with the real editor and the real dropdown.
 *
 * WHY THIS FILE EXISTS RATHER THAN ANOTHER SOURCE-TEXT SPEC. The toggle branch in `OnSkillsClick`
 * was dead code in a real browser and every source-text assertion still passed, because the code
 * SHAPE was correct and only the integration was broken: the editor's click-away listener is on
 * `document:mousedown` and exempts presses inside the EDITOR's host, while the Skills button is a
 * sibling of `<mj-mention-editor>`. A press on it therefore read as an outside press — mousedown
 * closed the dropdown, then click saw `SkillsActive` already false and reopened it. Reported by
 * @MattC-BC on #3731.
 *
 * So these tests fire events the way a browser does — bubbling `mousedown`, then `click` — instead
 * of calling handlers directly. Calling `OnSkillsClick()` by hand is exactly what hid the bug.
 */

const SKILLS: MentionSuggestion[] = [
  { id: 's1', name: 'Data Analysis', type: 'skill' } as unknown as MentionSuggestion,
  { id: 's2', name: 'Communications', type: 'skill' } as unknown as MentionSuggestion,
];

class StubSkillProvider extends ComposerTriggerProvider {
  public override readonly TriggerChar = '/';
  public override readonly Key = 'skill-commands';
  public Results: MentionSuggestion[] = SKILLS;
  public override async GetSuggestions(_r: ComposerSuggestionRequest): Promise<MentionSuggestion[]> {
    return this.Results;
  }
}

@Component({
  standalone: false,
  selector: 'test-host',
  template: `<mj-message-input-box [EnableSkills]="true" [EnableMentions]="true"
                                   [TriggerProviders]="providers"></mj-message-input-box>`,
})
class HostComponent {
  @Input() providers: ComposerTriggerProvider[] = [];
}

/** A real user press: mousedown bubbles to the document listener, then click fires the handler. */
function userClick(el: HTMLElement): void {
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
}

describe('Skills button — integrated toggle behaviour', () => {
  let provider: StubSkillProvider;

  const render = async () => {
    provider = new StubSkillProvider();
    await TestBed.configureTestingModule({
      // MJEmptyStateComponent is what the dropdown renders on no-matches; without it the empty
      // branch produces nothing and the zero-skills assertion cannot see it.
      imports: [FormsModule, MJEmptyStateComponent],
      declarations: [HostComponent, MessageInputBoxComponent, MentionEditorComponent, MentionDropdownComponent],
    }).compileComponents();
    const f = TestBed.createComponent(HostComponent);
    f.componentInstance.providers = [provider];
    f.detectChanges();
    await f.whenStable();
    f.detectChanges();
    return f;
  };

  const button = (f: Awaited<ReturnType<typeof render>>): HTMLElement =>
    f.nativeElement.querySelector('.skills-button-icon') as HTMLElement;
  const dropdownOpen = (f: Awaited<ReturnType<typeof render>>): boolean =>
    !!f.nativeElement.querySelector('mj-mention-dropdown');

  beforeEach(() => vi.restoreAllMocks());

  it('opens on the first press', async () => {
    const f = await render();
    expect(button(f)).not.toBeNull();
    userClick(button(f));
    await f.whenStable();
    f.detectChanges();
    expect(dropdownOpen(f)).toBe(true);
  });

  it('CLOSES on the second press — the toggle contract', async () => {
    // The regression this file was written for. Before the fix the mousedown closed it and the
    // click reopened it, so the menu blinked and stayed open.
    const f = await render();
    userClick(button(f));
    await f.whenStable();
    f.detectChanges();
    expect(dropdownOpen(f)).toBe(true);

    userClick(button(f));
    await f.whenStable();
    f.detectChanges();
    expect(dropdownOpen(f)).toBe(false);
  });

  it('emits BeforeSkillsOpened ONCE across two presses', async () => {
    // Requested by @MattC-BC on #3731. The visible state and the emission count are different
    // assertions: the toggle could look right while the second press still re-ran the open path,
    // double-counting for any host that meters skill usage off these events. Only counting catches
    // that, which is why it is asserted separately from the open/close test above.
    const f = await render();
    const box = f.debugElement.children[0].componentInstance as MessageInputBoxComponent;
    let beforeCount = 0;
    let afterCount = 0;
    box.BeforeSkillsOpened.subscribe(() => beforeCount++);
    box.AfterSkillsOpened.subscribe(() => afterCount++);

    userClick(button(f));
    await f.whenStable();
    f.detectChanges();
    expect(dropdownOpen(f)).toBe(true);

    userClick(button(f));
    await f.whenStable();
    f.detectChanges();
    expect(dropdownOpen(f)).toBe(false);

    expect(beforeCount).toBe(1);
    expect(afterCount).toBe(1);
  });

  it('a press elsewhere in the document still dismisses it', async () => {
    // The click-away fix must survive stopping propagation on the button.
    const f = await render();
    userClick(button(f));
    await f.whenStable();
    f.detectChanges();
    expect(dropdownOpen(f)).toBe(true);

    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    await f.whenStable();
    f.detectChanges();
    expect(dropdownOpen(f)).toBe(false);
  });

  it('writes nothing into the composer when opened and dismissed', async () => {
    // The virtual trigger's whole point: no stray '/' the user never typed.
    const f = await render();
    const box = f.debugElement.children[0].componentInstance as MessageInputBoxComponent;
    userClick(button(f));
    await f.whenStable();
    f.detectChanges();
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    await f.whenStable();
    f.detectChanges();
    expect(box.Value ?? '').toBe('');
  });

  it('advertises disclosure semantics, not toggle semantics', async () => {
    // Plan Mode beside it is a mode that stays on, so aria-pressed is right there. This reveals a
    // popup, so aria-expanded + aria-haspopup is what a screen reader should hear.
    const f = await render();
    const b = button(f);
    expect(b.getAttribute('aria-haspopup')).toBe('true');
    expect(b.getAttribute('aria-expanded')).toBe('false');

    userClick(b);
    await f.whenStable();
    f.detectChanges();
    expect(button(f).getAttribute('aria-expanded')).toBe('true');
  });

  it('renders the strip when Skills is the only control enabled', async () => {
    // The visibility gate: without EnableSkills joining it, a composer with skills but no
    // attachments, voice or plan mode rendered no strip at all and the button vanished.
    const f = await render();
    expect(f.nativeElement.querySelector('.attach-buttons')).not.toBeNull();
    expect(f.nativeElement.querySelector('.plan-mode-button-icon')).toBeNull();
  });

  it('stays open with an empty state when the host has no skills', async () => {
    // A button press must not be a silent no-op. A typed trigger closing on no matches is fine;
    // a button doing it reads as broken, and made the dropdown's empty state unreachable.
    const f = await render();
    provider.Results = [];
    userClick(button(f));
    await f.whenStable();
    f.detectChanges();
    // Both halves matter: the dropdown must stay open AND actually say something. Asserting only
    // that it is open would pass for an empty box, which reads just as broken as the no-op did.
    expect(dropdownOpen(f)).toBe(true);
    expect(f.nativeElement.querySelector('mj-empty-state')).not.toBeNull();
  });
});
