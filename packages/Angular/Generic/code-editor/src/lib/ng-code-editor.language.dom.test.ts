import { describe, it, expect } from 'vitest';
import { languages } from '@codemirror/language-data';
import { CodeEditorComponent } from './ng-code-editor.component';

/**
 * Spec for CodeEditorComponent's language lookup.
 *
 * Called on the prototype against a stub `this`, because `_findLanguage` is pure over
 * `this.Languages` — no CodeMirror EditorView is constructed, which is what the toolbar spec next
 * to this file has to mock ngOnInit to avoid. Lives under the DOM preset rather than __tests__
 * because importing the component class needs the Angular compile (see vitest.config.ts).
 *
 * The stub must spell the property the way the method reads it: the `languages` @Input was renamed
 * to `Languages`, and the deprecated accessor pair left behind lives on the PROTOTYPE, so a plain
 * object literal carrying `languages` does not get it. Shorthand made the mismatch invisible.
 */
const find = (name: string) =>
  (CodeEditorComponent.prototype as unknown as { _findLanguage(n: string): { name: string } | null })
    ._findLanguage.call({ Languages: languages }, name);

describe('CodeEditorComponent._findLanguage', () => {
  it('resolves a name that CodeMirror registers only as a file extension', () => {
    // 'jinja2' is one of Jinja's extensions (["j2","jinja","jinja2"]) and its only name is "Jinja".
    // core-entity-forms' template editors ask for 'jinja2', which matched nothing before.
    expect(find('jinja2')?.name).toBe('Jinja');
  });

  it('resolves by name, case-insensitively', () => {
    expect(find('Jinja')?.name).toBe('Jinja');
    expect(find('TYPESCRIPT')?.name).toBe('TypeScript');
  });

  it('lets a name outrank an extension, never the other way round', () => {
    // The ordering guarantee behind making extensions a FALLBACK: a string that is one language's
    // name must resolve to it even when it also appears among some other language's extensions.
    expect(find('r')?.name).toBe('R');
    expect(find('html')?.name).toBe('HTML');
  });

  it('returns null when nothing matches by name, alias or extension', () => {
    expect(find('definitely-not-a-language')).toBeNull();
  });
});
