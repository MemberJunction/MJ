import { describe, it, expect, vi, beforeAll } from 'vitest';
import { CommonModule } from '@angular/common';
import { ComponentFixture } from '@angular/core/testing';
import { renderComponentFixture, query } from '@memberjunction/ng-test-utils';
import { MJEmptyStateComponent } from '@memberjunction/ng-ui-components';
import { UserInfo } from '@memberjunction/core';
import { MentionEditorComponent } from './mention-editor.component';
import { MentionDropdownComponent } from './mention-dropdown.component';
import { MentionAutocompleteService, MentionSuggestion } from '../../services/mention-autocomplete.service';

/**
 * DOM spec for <mj-mention-editor> — focused on the granular trigger toggles:
 * enableAgentMentions ('@'), enableEntityMentions ('#'), enableSkillCommands ('/'),
 * all under the enableMentions master switch. Each test types a trigger + query
 * into the contentEditable editor (with a real Selection/Range so the component's
 * cursor-based trigger detection runs) and asserts whether the autocomplete
 * dropdown opens and which trigger the service was queried with.
 */
describe('MentionEditorComponent trigger toggles (DOM)', () => {
  const agentSuggestion: MentionSuggestion = {
    type: 'agent',
    id: 'a1',
    name: 'Sage',
    displayName: 'Sage',
    icon: 'fa-robot'
  };

  beforeAll(() => {
    // jsdom doesn't lay out text, and older versions don't implement
    // Range.getBoundingClientRect at all — the dropdown positioning code only
    // needs it to return a rect-shaped object.
    if (typeof Range.prototype.getBoundingClientRect !== 'function') {
      Range.prototype.getBoundingClientRect = () =>
        ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    }
  });

  function makeUser(): UserInfo {
    const user = new UserInfo();
    user.ID = 'u1';
    user.Name = 'Test User';
    return user;
  }

  function makeService(): MentionAutocompleteService {
    const service = new MentionAutocompleteService();
    vi.spyOn(service, 'initialize').mockResolvedValue(undefined);
    vi.spyOn(service, 'getSuggestions').mockReturnValue([agentSuggestion]);
    return service;
  }

  function render(
    service: MentionAutocompleteService,
    inputs: Record<string, unknown> = {}
  ): ComponentFixture<MentionEditorComponent> {
    return renderComponentFixture(MentionEditorComponent, {
      imports: [CommonModule, MJEmptyStateComponent],
      declarations: [MentionEditorComponent, MentionDropdownComponent],
      providers: [{ provide: MentionAutocompleteService, useValue: service }],
      inputs: { currentUser: makeUser(), ...inputs }
    });
  }

  /**
   * Types text into the contentEditable editor, placing the cursor at the end,
   * then dispatches a real `input` event so Angular's own event binding runs
   * onInput() (zoneless CD requires state changes to originate from tracked
   * events) and awaits change detection.
   */
  async function type(f: ComponentFixture<MentionEditorComponent>, textValue: string): Promise<void> {
    const editor = f.componentInstance.editorRef.nativeElement;
    editor.textContent = textValue;
    const textNode = editor.firstChild as Text;
    const range = document.createRange();
    range.setStart(textNode, textValue.length);
    range.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    editor.dispatchEvent(new InputEvent('input', { bubbles: true }));
    await f.whenStable();
  }

  it('opens the dropdown for "@" when agent mentions are enabled (default)', async () => {
    const service = makeService();
    const f = render(service);
    await type(f, '@sa');
    expect(service.getSuggestions).toHaveBeenCalledWith('sa', true, '@');
    expect(f.componentInstance.showMentionDropdown).toBe(true);
    expect(query(f, 'mj-mention-dropdown')).not.toBeNull();
  });

  it('ignores "@" when enableAgentMentions is false', async () => {
    const service = makeService();
    const f = render(service, { enableAgentMentions: false });
    await type(f, '@sa');
    expect(service.getSuggestions).not.toHaveBeenCalled();
    expect(f.componentInstance.showMentionDropdown).toBe(false);
    expect(query(f, 'mj-mention-dropdown')).toBeNull();
  });

  it('opens the dropdown for "#" when entity mentions are enabled (default)', async () => {
    const service = makeService();
    const f = render(service);
    await type(f, '#cust');
    expect(service.getSuggestions).toHaveBeenCalledWith('cust', true, '#');
    expect(f.componentInstance.showMentionDropdown).toBe(true);
  });

  it('ignores "#" when enableEntityMentions is false', async () => {
    const service = makeService();
    const f = render(service, { enableEntityMentions: false });
    await type(f, '#cust');
    expect(service.getSuggestions).not.toHaveBeenCalled();
    expect(f.componentInstance.showMentionDropdown).toBe(false);
  });

  it('opens the dropdown for "/" when skill commands are enabled (default)', async () => {
    const service = makeService();
    const f = render(service);
    await type(f, '/sk');
    expect(service.getSuggestions).toHaveBeenCalledWith('sk', true, '/');
    expect(f.componentInstance.showMentionDropdown).toBe(true);
  });

  it('ignores "/" when enableSkillCommands is false', async () => {
    const service = makeService();
    const f = render(service, { enableSkillCommands: false });
    await type(f, '/sk');
    expect(service.getSuggestions).not.toHaveBeenCalled();
    expect(f.componentInstance.showMentionDropdown).toBe(false);
  });

  it('disables all triggers when the enableMentions master switch is off', async () => {
    const service = makeService();
    const f = render(service, { enableMentions: false });
    await type(f, '@sa');
    expect(service.getSuggestions).not.toHaveBeenCalled();
    expect(f.componentInstance.showMentionDropdown).toBe(false);
    expect(query(f, 'mj-mention-dropdown')).toBeNull();
  });

  it('falls back to the nearest ENABLED trigger when a later trigger is disabled', async () => {
    // '@' disabled, '#' enabled — the '@x' earlier in the text is ignored and the
    // '#' trigger (nearest ENABLED trigger before the cursor) opens the dropdown.
    const service = makeService();
    const f = render(service, { enableAgentMentions: false });
    await type(f, 'hello @x #y');
    expect(service.getSuggestions).toHaveBeenCalledWith('y', true, '#');
    expect(f.componentInstance.showMentionDropdown).toBe(true);
  });
});
