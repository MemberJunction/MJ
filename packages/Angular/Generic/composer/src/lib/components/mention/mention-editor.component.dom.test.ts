import { describe, it, expect, vi, beforeAll } from 'vitest';
import { CommonModule } from '@angular/common';
import { ComponentFixture } from '@angular/core/testing';
import { renderComponentFixture, query } from '@memberjunction/ng-test-utils';
import { MJEmptyStateComponent } from '@memberjunction/ng-ui-components';
import { UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { MentionEditorComponent } from './mention-editor.component';
import { MentionDropdownComponent } from './mention-dropdown.component';
import {
  ComposerSuggestionRequest,
  ComposerTriggerProvider,
  MentionSuggestion
} from '../../composer-trigger-provider';

/**
 * DOM spec for <mj-mention-editor> — focused on the pluggable trigger-provider model:
 * explicit `TriggerProviders` list mode, ClassFactory discovery mode with
 * `ExcludedTriggerKeys`, the `enableMentions` master switch, and inert unknown
 * triggers. Each test types a trigger + query into the contentEditable editor (with a
 * real Selection/Range so the component's cursor-based trigger detection runs) and
 * asserts whether the autocomplete dropdown opens and which provider was queried.
 */

const agentSuggestion: MentionSuggestion = {
  type: 'agent',
  id: 'a1',
  name: 'Sage',
  displayName: 'Sage',
  icon: 'fa-robot'
};

const entitySuggestion: MentionSuggestion = {
  type: 'entity',
  id: 'e1',
  name: 'Customers',
  displayName: 'Customers',
  icon: 'fa-solid fa-table'
};

/** Test provider owning '@' — suggestion payload + call tracking via a plain spy. */
class FakeAtProvider extends ComposerTriggerProvider {
  public override readonly TriggerChar: string = '@';
  public override readonly Key: string = 'fake-at';
  public override readonly Priority: number = 10;
  public GetSuggestionsSpy = vi.fn(async (_request: ComposerSuggestionRequest): Promise<MentionSuggestion[]> => [agentSuggestion]);
  public override GetSuggestions(request: ComposerSuggestionRequest): Promise<MentionSuggestion[]> {
    return this.GetSuggestionsSpy(request);
  }
}

/** Test provider owning '#'. */
class FakeHashProvider extends ComposerTriggerProvider {
  public override readonly TriggerChar: string = '#';
  public override readonly Key: string = 'fake-hash';
  public GetSuggestionsSpy = vi.fn(async (_request: ComposerSuggestionRequest): Promise<MentionSuggestion[]> => [entitySuggestion]);
  public override GetSuggestions(request: ComposerSuggestionRequest): Promise<MentionSuggestion[]> {
    return this.GetSuggestionsSpy(request);
  }
}

// Discovery-mode fixtures: registered with the ClassFactory exactly the way real
// plugins are (`@RegisterClass(ComposerTriggerProvider, '<Key>')`). Registrations are
// process-global, so ALL discovery-mode assertions in this file account for both.
@RegisterClass(ComposerTriggerProvider, 'discovered-at')
class DiscoveredAtProvider extends ComposerTriggerProvider {
  public override readonly TriggerChar: string = '@';
  public override readonly Key: string = 'discovered-at';
  public override async GetSuggestions(_request: ComposerSuggestionRequest): Promise<MentionSuggestion[]> {
    return [agentSuggestion];
  }
}

@RegisterClass(ComposerTriggerProvider, 'discovered-hash')
class DiscoveredHashProvider extends ComposerTriggerProvider {
  public override readonly TriggerChar: string = '#';
  public override readonly Key: string = 'discovered-hash';
  public override async GetSuggestions(_request: ComposerSuggestionRequest): Promise<MentionSuggestion[]> {
    return [entitySuggestion];
  }
}

describe('MentionEditorComponent trigger providers (DOM)', () => {
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

  function render(inputs: Record<string, unknown> = {}): ComponentFixture<MentionEditorComponent> {
    return renderComponentFixture(MentionEditorComponent, {
      imports: [CommonModule, MJEmptyStateComponent],
      declarations: [MentionEditorComponent, MentionDropdownComponent],
      inputs: { currentUser: makeUser(), ...inputs }
    });
  }

  /**
   * Types text into the contentEditable editor, placing the cursor at the end,
   * then dispatches a real `input` event so Angular's own event binding runs
   * onInput() (zoneless CD requires state changes to originate from tracked
   * events), flushes the async provider fetch (macrotask), and awaits CD.
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
    // The suggestion fetch is async (provider promises) — flush it before asserting
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    await f.whenStable();
  }

  describe('explicit TriggerProviders list mode', () => {
    it('opens the dropdown for a provider-owned trigger and passes the query', async () => {
      const at = new FakeAtProvider();
      const f = render({ TriggerProviders: [at] });
      await type(f, '@sa');
      expect(at.GetSuggestionsSpy).toHaveBeenCalledTimes(1);
      const request = at.GetSuggestionsSpy.mock.calls[0][0];
      expect(request.Query).toBe('sa');
      expect(request.ContextUser?.ID).toBe('u1');
      expect(f.componentInstance.showMentionDropdown).toBe(true);
      expect(query(f, 'mj-mention-dropdown')).not.toBeNull();
    });

    it('routes each trigger char to ITS provider only', async () => {
      const at = new FakeAtProvider();
      const hash = new FakeHashProvider();
      const f = render({ TriggerProviders: [at, hash] });
      await type(f, '#cust');
      expect(hash.GetSuggestionsSpy).toHaveBeenCalledTimes(1);
      expect(hash.GetSuggestionsSpy.mock.calls[0][0].Query).toBe('cust');
      expect(at.GetSuggestionsSpy).not.toHaveBeenCalled();
      expect(f.componentInstance.mentionSuggestions).toEqual([entitySuggestion]);
    });

    it('ignores a trigger char no provider in the explicit list owns', async () => {
      const at = new FakeAtProvider();
      const f = render({ TriggerProviders: [at] });
      await type(f, '#cust');
      expect(at.GetSuggestionsSpy).not.toHaveBeenCalled();
      expect(f.componentInstance.showMentionDropdown).toBe(false);
      expect(query(f, 'mj-mention-dropdown')).toBeNull();
    });

    it('ignores unknown trigger chars entirely (plain typing stays inert)', async () => {
      const at = new FakeAtProvider();
      const f = render({ TriggerProviders: [at] });
      await type(f, 'plain $text');
      expect(at.GetSuggestionsSpy).not.toHaveBeenCalled();
      expect(f.componentInstance.showMentionDropdown).toBe(false);
    });

    it('concatenates results when two providers share a trigger char', async () => {
      const at = new FakeAtProvider();
      const secondAt = new FakeHashProvider();
      // Repurpose the '#' fixture onto '@' so two providers share the char
      Object.defineProperty(secondAt, 'TriggerChar', { value: '@' });
      const f = render({ TriggerProviders: [at, secondAt] });
      await type(f, '@x');
      expect(f.componentInstance.mentionSuggestions).toEqual([agentSuggestion, entitySuggestion]);
    });

    it('closes the dropdown when the mention is completed with a space', async () => {
      const at = new FakeAtProvider();
      const f = render({ TriggerProviders: [at] });
      await type(f, '@sa');
      expect(f.componentInstance.showMentionDropdown).toBe(true);
      await type(f, '@sage done ');
      expect(f.componentInstance.showMentionDropdown).toBe(false);
    });
  });

  describe('ClassFactory discovery mode', () => {
    it('discovers registered providers when no explicit list is bound', async () => {
      const f = render();
      await type(f, '#cust');
      expect(f.componentInstance.showMentionDropdown).toBe(true);
      expect(f.componentInstance.mentionSuggestions).toEqual([entitySuggestion]);
    });

    it('skips providers listed in ExcludedTriggerKeys', async () => {
      const f = render({ ExcludedTriggerKeys: ['discovered-hash'] });
      await type(f, '#cust');
      expect(f.componentInstance.showMentionDropdown).toBe(false);
      // The '@' provider is still discovered and active
      await type(f, '@sa');
      expect(f.componentInstance.showMentionDropdown).toBe(true);
      expect(f.componentInstance.mentionSuggestions).toEqual([agentSuggestion]);
    });

    it('degrades to a plain editor when every discovered provider is excluded', async () => {
      const f = render({ ExcludedTriggerKeys: ['discovered-at', 'discovered-hash'] });
      await type(f, '@sa');
      expect(f.componentInstance.showMentionDropdown).toBe(false);
      expect(query(f, 'mj-mention-dropdown')).toBeNull();
    });
  });

  describe('enableMentions master switch', () => {
    it('disables ALL triggers when off — explicit list mode', async () => {
      const at = new FakeAtProvider();
      const f = render({ enableMentions: false, TriggerProviders: [at] });
      await type(f, '@sa');
      expect(at.GetSuggestionsSpy).not.toHaveBeenCalled();
      expect(f.componentInstance.showMentionDropdown).toBe(false);
      expect(query(f, 'mj-mention-dropdown')).toBeNull();
    });

    it('disables ALL triggers when off — discovery mode', async () => {
      const f = render({ enableMentions: false });
      await type(f, '#cust');
      expect(f.componentInstance.showMentionDropdown).toBe(false);
    });
  });

  it('falls back to the nearest ACTIVE trigger when a later trigger has no provider', async () => {
    // Only '#' is owned — the '@x' later in the text is ignored and the '#'
    // trigger (nearest ACTIVE trigger before the cursor) opens the dropdown.
    const hash = new FakeHashProvider();
    const f = render({ TriggerProviders: [hash] });
    await type(f, 'hello @x #y');
    expect(hash.GetSuggestionsSpy).toHaveBeenCalledTimes(1);
    expect(hash.GetSuggestionsSpy.mock.calls[0][0].Query).toBe('y');
    expect(f.componentInstance.showMentionDropdown).toBe(true);
  });
});

describe('InsertMention (programmatic resolved chip)', () => {
    function mount(): ComponentFixture<MentionEditorComponent> {
        const user = new UserInfo();
        user.ID = 'u-insert';
        user.Name = 'Insert Tester';
        return renderComponentFixture(MentionEditorComponent, {
            imports: [CommonModule, MJEmptyStateComponent],
            declarations: [MentionEditorComponent, MentionDropdownComponent],
            inputs: { currentUser: user },
        });
    }

    const SAGE: MentionSuggestion = {
        type: 'agent', id: 'ag-1', name: 'Sage', displayName: 'Sage', icon: 'fa-solid fa-leaf',
    };

    it('inserts a resolved chip + trailing space at the end and updates the bound value', () => {
        const fixture = mount();
        fixture.detectChanges();
        const ok = fixture.componentInstance.InsertMention(SAGE, false);
        fixture.detectChanges();
        expect(ok).toBe(true);
        const editor = fixture.componentInstance.editorRef.nativeElement;
        const chip = editor.querySelector('.mention-chip') as HTMLElement;
        expect(chip).toBeTruthy();
        expect(chip.getAttribute('data-mention-name')).toBe('Sage');
        expect(chip.getAttribute('data-mention-type')).toBe('agent');
        // Trailing space follows the chip so the user can type immediately.
        expect(chip.nextSibling?.textContent).toBe(' ');
        // The CVA value reflects the serialized mention (chip data attribute is authoritative).
        expect(editor.textContent).toContain('Sage');
    });

    it('places the caret AFTER the trailing space (typing lands past the pill)', () => {
        const fixture = mount();
        fixture.detectChanges();
        fixture.componentInstance.InsertMention(SAGE, true);
        fixture.detectChanges();
        const selection = window.getSelection();
        expect(selection).toBeTruthy();
        const editor = fixture.componentInstance.editorRef.nativeElement;
        const chip = editor.querySelector('.mention-chip') as HTMLElement;
        // Caret container must be the space text node right after the chip (or positioned after it).
        const range = selection!.getRangeAt(0);
        expect(range.collapsed).toBe(true);
        // setStartAfter(space) puts the caret in the editor node, offset past the
        // space that follows the chip — i.e. at the very end of the content.
        expect(range.startContainer).toBe(editor);
        expect(range.startOffset).toBe(editor.childNodes.length);
    });
});

describe('ParseSerializedMentions + writeValue rehydration', () => {
    function mount(): ComponentFixture<MentionEditorComponent> {
        const user = new UserInfo();
        user.ID = 'u-rehydrate';
        user.Name = 'Rehydrate Tester';
        return renderComponentFixture(MentionEditorComponent, {
            imports: [CommonModule, MJEmptyStateComponent],
            declarations: [MentionEditorComponent, MentionDropdownComponent],
            inputs: { currentUser: user },
        });
    }

    it('passes plain text through untouched', () => {
        const segs = MentionEditorComponent.ParseSerializedMentions('just some text');
        expect(segs).toEqual(['just some text']);
    });

    it('parses a mention token with surrounding text', () => {
        const segs = MentionEditorComponent.ParseSerializedMentions(
            'ask @{"type":"agent","id":"a1","name":"Sage"} about renewals');
        expect(segs).toHaveLength(3);
        expect(segs[0]).toBe('ask ');
        expect((segs[1] as { suggestion: MentionSuggestion }).suggestion.name).toBe('Sage');
        expect(segs[2]).toBe(' about renewals');
    });

    it('carries configuration preset fields', () => {
        const segs = MentionEditorComponent.ParseSerializedMentions(
            '@{"type":"agent","id":"a1","name":"Sage","configId":"c9","config":"High Power"} ');
        const seg = segs[0] as { configId?: string; config?: string };
        expect(seg.configId).toBe('c9');
        expect(seg.config).toBe('High Power');
    });

    it('leaves malformed candidates as literal text', () => {
        const segs = MentionEditorComponent.ParseSerializedMentions('email me @{not json} ok');
        expect(segs.every((s) => typeof s === 'string')).toBe(true);
        expect(segs.join('')).toBe('email me @{not json} ok');
    });

    it('handles braces inside quoted names (string-aware brace matching)', () => {
        const segs = MentionEditorComponent.ParseSerializedMentions(
            '@{"type":"entity","id":"e1","name":"Weird {Braces} Entity"} tail');
        expect((segs[0] as { suggestion: MentionSuggestion }).suggestion.name).toBe('Weird {Braces} Entity');
        expect(segs[1]).toBe(' tail');
    });

    it('writeValue rehydrates a serialized draft into a real chip + text', () => {
        const fixture = mount();
        fixture.detectChanges();
        fixture.componentInstance.writeValue('@{"type":"agent","id":"a1","name":"Sage","configId":"c9","config":"Fast"} summarize renewals');
        fixture.detectChanges();
        const editor = fixture.componentInstance.editorRef.nativeElement;
        const chip = editor.querySelector('.mention-chip') as HTMLElement;
        expect(chip).toBeTruthy();
        expect(chip.getAttribute('data-mention-name')).toBe('Sage');
        expect(chip.getAttribute('data-preset-id')).toBe('c9');
        expect(editor.textContent).toContain('summarize renewals');
    });

    it('writeValue keeps the plain-text fast path for token-free strings', () => {
        const fixture = mount();
        fixture.detectChanges();
        fixture.componentInstance.writeValue('nothing fancy here');
        fixture.detectChanges();
        const editor = fixture.componentInstance.editorRef.nativeElement;
        expect(editor.querySelector('.mention-chip')).toBeNull();
        expect(editor.textContent).toBe('nothing fancy here');
    });
});
