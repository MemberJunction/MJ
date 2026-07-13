import { describe, it, expect } from 'vitest';
import { CommonModule } from '@angular/common';
import { renderComponentFixture, query, queryAll, text, hasClass, click, capture } from '@memberjunction/ng-test-utils';
import { CodeEditorComponent } from './ng-code-editor.component';
import { ToolbarConfig } from './toolbar-config';

/**
 * DOM spec for <mj-code-editor>.
 *
 * SCOPE: the toolbar surface only. The component instantiates a CodeMirror EditorView in
 * ngOnInit, so every render exercises that; the editor's own contenteditable surface is
 * CodeMirror-owned (and needs real layout/measurement) and is therefore NOT asserted here —
 * that belongs to CodeMirror's own tests / a live test. What IS ours is the Angular toolbar
 * template: the enabled gate, the group/button @for, per-button visibility/disabled/label/icon
 * bindings, the inter-group separator, and the toolbarAction @Output on click.
 */

const MOD = { imports: [CommonModule], declarations: [CodeEditorComponent] };

const toolbar = (over: Partial<ToolbarConfig> = {}): ToolbarConfig => ({ enabled: true, ...over });

describe('CodeEditorComponent (DOM — toolbar)', () => {
  it('renders no toolbar when toolbar.enabled is false (default)', () => {
    const f = renderComponentFixture(CodeEditorComponent, { ...MOD });
    expect(query(f, '.mj-code-editor-toolbar')).toBeNull();
    // sanity: the editor content host still renders
    expect(query(f, '.mj-code-editor-content')).not.toBeNull();
  });

  it('applies the top toolbar-position classes by default', () => {
    const f = renderComponentFixture(CodeEditorComponent, {
      ...MOD,
      inputs: { toolbar: toolbar({ buttons: [{ id: 'copy', icon: 'fa-copy' }] }) },
    });
    expect(hasClass(f, '.mj-code-editor-content', 'has-toolbar-top')).toBe(true);
    expect(hasClass(f, '.mj-code-editor-toolbar', 'toolbar-bottom')).toBe(false);
  });

  it('applies the bottom toolbar-position classes when position is bottom', () => {
    const f = renderComponentFixture(CodeEditorComponent, {
      ...MOD,
      inputs: { toolbar: toolbar({ position: 'bottom', buttons: [{ id: 'copy', icon: 'fa-copy' }] }) },
    });
    expect(hasClass(f, '.mj-code-editor-toolbar', 'toolbar-bottom')).toBe(true);
    expect(hasClass(f, '.mj-code-editor-content', 'has-toolbar-bottom')).toBe(true);
    expect(hasClass(f, '.mj-code-editor-content', 'has-toolbar-top')).toBe(false);
  });

  it('renders the toolbar with one button per configured button', () => {
    const f = renderComponentFixture(CodeEditorComponent, {
      ...MOD,
      inputs: {
        toolbar: toolbar({
          buttons: [
            { id: 'copy', icon: 'fa-regular fa-copy', label: 'Copy' },
            { id: 'wrap', icon: 'fa-solid fa-text-width' },
          ],
        }),
      },
    });
    expect(query(f, '.mj-code-editor-toolbar')).not.toBeNull();
    const buttons = queryAll(f, '.toolbar-button');
    expect(buttons.length).toBe(2);
    expect(buttons.map((b) => b.getAttribute('data-button-id'))).toEqual(['copy', 'wrap']);
  });

  it('renders a button label only when one is provided', () => {
    const f = renderComponentFixture(CodeEditorComponent, {
      ...MOD,
      inputs: { toolbar: toolbar({ buttons: [{ id: 'copy', icon: 'fa-regular fa-copy', label: 'Copy' }] }) },
    });
    expect(text(f, '.toolbar-button .button-label')).toBe('Copy');
    expect(hasClass(f, '.toolbar-button i', 'fa-copy')).toBe(true);
  });

  it('hides a button whose visible is explicitly false', () => {
    const f = renderComponentFixture(CodeEditorComponent, {
      ...MOD,
      inputs: {
        toolbar: toolbar({
          buttons: [
            { id: 'copy', icon: 'fa-copy' },
            { id: 'hidden', icon: 'fa-eye-slash', visible: false },
          ],
        }),
      },
    });
    const ids = queryAll(f, '.toolbar-button').map((b) => b.getAttribute('data-button-id'));
    expect(ids).toEqual(['copy']);
  });

  it('reflects a button disabled flag onto the button element', () => {
    const f = renderComponentFixture(CodeEditorComponent, {
      ...MOD,
      inputs: { toolbar: toolbar({ buttons: [{ id: 'copy', icon: 'fa-copy', disabled: true }] }) },
    });
    expect((query(f, '.toolbar-button') as HTMLButtonElement).disabled).toBe(true);
  });

  it('renders a separator between groups (but not after the last)', () => {
    const f = renderComponentFixture(CodeEditorComponent, {
      ...MOD,
      inputs: {
        toolbar: toolbar({
          groups: [
            { id: 'g1', buttons: [{ id: 'a', icon: 'fa-a' }], separator: true },
            { id: 'g2', buttons: [{ id: 'b', icon: 'fa-b' }], separator: true },
          ],
        }),
      },
    });
    // two groups both flagged separator:true, but the last group's separator is suppressed
    expect(queryAll(f, '.toolbar-separator')).toHaveLength(1);
  });

  it('emits toolbarAction with the buttonId when a toolbar button is clicked', () => {
    const f = renderComponentFixture(CodeEditorComponent, {
      ...MOD,
      inputs: { toolbar: toolbar({ buttons: [{ id: 'copy', icon: 'fa-copy' }] }) },
    });
    const actions = capture(f.componentInstance.toolbarAction);
    click(f, '.toolbar-button');
    expect(actions).toHaveLength(1);
    expect(actions[0].buttonId).toBe('copy');
  });
});
