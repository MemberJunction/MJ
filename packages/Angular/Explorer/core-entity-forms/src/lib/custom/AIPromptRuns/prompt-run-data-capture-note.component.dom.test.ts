import { describe, it, expect } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MJAlertComponent } from '@memberjunction/ng-ui-components';
import { Query, QueryAll, Text } from '@memberjunction/ng-test-utils';
import type { TemplateDataCaptureMode, TemplateDataShape } from '@memberjunction/ai-core-plus';
import { PromptRunDataCaptureNoteComponent } from './prompt-run-data-capture-note.component';

/**
 * DOM coverage for <mj-prompt-run-data-capture-note>, a presentational component driven only by its
 * three @Inputs. Covers the note for each capture mode, the key-size table of a `None` run (order,
 * size formats, the elided-keys notice) and malformed shape records parsed from stored JSON.
 */

type NoteFixture = ComponentFixture<PromptRunDataCaptureNoteComponent>;

interface NoteInputs {
  DataCapture: TemplateDataCaptureMode | null;
  DataShape?: TemplateDataShape | null;
  DataCaptureNote?: string | null;
}

const NONE_MESSAGE = 'Template data was not stored for this run (capture: None).';
const REFERENCED_MESSAGE = "Only the template data keys the prompt's templates read were stored (capture: Referenced).";
const RUNNER_NOTE = 'Referenced capture stored all data: prompt "Summarize": template "Child" was not found';

function render(inputs: NoteInputs): NoteFixture {
  TestBed.configureTestingModule({ imports: [MJAlertComponent], declarations: [PromptRunDataCaptureNoteComponent] });
  const fixture = TestBed.createComponent(PromptRunDataCaptureNoteComponent);
  fixture.componentRef.setInput('DataCapture', inputs.DataCapture);
  fixture.componentRef.setInput('DataShape', inputs.DataShape ?? null);
  fixture.componentRef.setInput('DataCaptureNote', inputs.DataCaptureNote ?? null);
  fixture.detectChanges(false);
  return fixture;
}

/** Sets one input after the first render, then renders again. */
function setAndRender<K extends keyof NoteInputs>(fixture: NoteFixture, name: K, value: NoteInputs[K]): void {
  fixture.componentRef.setInput(name, value);
  fixture.detectChanges(false);
}

/** `count` keys named `<prefix>1` to `<prefix><count>`, sized 100, 200, 300 and so on. */
function generatedKeys(prefix: string, count: number): Record<string, number> {
  return Object.fromEntries(Array.from({ length: count }, (_, i) => [`${prefix}${i + 1}`, (i + 1) * 100]));
}

/** Cell texts of each table body row: [input, key, size]. */
function rowCells(fixture: NoteFixture): string[][] {
  return QueryAll(fixture, 'tbody tr').map((row) => Array.from(row.querySelectorAll('td'), (cell) => cell.textContent?.trim() ?? ''));
}

function notices(fixture: NoteFixture): string[] {
  return QueryAll(fixture, '.data-shape-elided').map((notice) => notice.textContent?.trim() ?? '');
}

/** All rendered text, with whitespace collapsed. */
function renderedText(fixture: NoteFixture): string {
  return ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' ').trim();
}

describe('PromptRunDataCaptureNoteComponent (DOM)', () => {
  it('renders nothing for a run saved before capture modes, even with a shape and a note', () => {
    const fixture = render({
      DataCapture: null,
      DataShape: { data: { keyCount: 1, totalBytes: 10, keys: { question: 10 } } },
      DataCaptureNote: RUNNER_NOTE,
    });
    expect(Query(fixture, '.data-capture-note')).toBeNull();
    expect(renderedText(fixture)).toBe('');
  });

  it('says a None run stored no template data and lists its key sizes, data rows before templateData rows', () => {
    const fixture = render({
      DataCapture: 'None',
      DataShape: {
        templateData: { keyCount: 1, totalBytes: 2048, keys: { history: 2048 } },
        data: { keyCount: 3, totalBytes: 419852, keys: { compositionContext: 266240, componentCatalog: 153600, userQuestion: 12 } },
      },
    });
    expect(Text(fixture, '.data-capture-message')).toBe(NONE_MESSAGE);
    expect(QueryAll(fixture, 'thead th').map((header) => header.textContent?.trim())).toEqual(['Input', 'Key', 'Size']);
    expect(rowCells(fixture)).toEqual([
      ['data', 'compositionContext', '260.0 KB'],
      ['data', 'componentCatalog', '150.0 KB'],
      ['data', 'userQuestion', '12 B'],
      ['templateData', 'history', '2.0 KB'],
    ]);
    expect(notices(fixture)).toEqual([]);
  });

  it('shows only the message for a None run whose caller passed no template data', () => {
    const fixture = render({ DataCapture: 'None', DataShape: null });
    expect(Text(fixture, '.data-capture-message')).toBe(NONE_MESSAGE);
    expect(Query(fixture, 'table')).toBeNull();
  });

  it('says a Referenced run stored only the keys its templates read, without a table', () => {
    const fixture = render({
      DataCapture: 'Referenced',
      DataShape: { data: { keyCount: 1, totalBytes: 10, keys: { question: 10 } } },
    });
    expect(Text(fixture, '.data-capture-message')).toBe(REFERENCED_MESSAGE);
    expect(Query(fixture, 'table')).toBeNull();
  });

  it('says a Full run with a note stored all template data, followed by the note', () => {
    const fixture = render({ DataCapture: 'Full', DataCaptureNote: RUNNER_NOTE });
    expect(Text(fixture, '.data-capture-message')).toBe(`All template data was stored (capture: Full). ${RUNNER_NOTE}`);
    expect(Query(fixture, 'table')).toBeNull();
  });

  it.each([null, '', '   '])('renders nothing for a Full run without a note (%j)', (note) => {
    const fixture = render({ DataCapture: 'Full', DataCaptureNote: note });
    expect(Query(fixture, '.data-capture-note')).toBeNull();
    expect(renderedText(fixture)).toBe('');
  });

  it('updates the note when DataCapture changes after the first render', () => {
    const fixture = render({ DataCapture: 'Full' });
    setAndRender(fixture, 'DataCapture', 'None');
    expect(Text(fixture, '.data-capture-message')).toBe(NONE_MESSAGE);
  });

  it('updates the note when DataCaptureNote changes after the first render', () => {
    const fixture = render({ DataCapture: 'Full' });
    setAndRender(fixture, 'DataCaptureNote', RUNNER_NOTE);
    expect(Text(fixture, '.data-capture-message')).toBe(`All template data was stored (capture: Full). ${RUNNER_NOTE}`);
  });

  it('updates the rows when DataShape changes after the first render', () => {
    const fixture = render({ DataCapture: 'None', DataShape: { data: { keyCount: 1, totalBytes: 10, keys: { question: 10 } } } });
    setAndRender(fixture, 'DataShape', { data: { keyCount: 1, totalBytes: 2048, keys: { answer: 2048 } } });
    expect(rowCells(fixture)).toEqual([['data', 'answer', '2.0 KB']]);
  });

  it("sorts each input's rows by size, largest first", () => {
    const fixture = render({
      DataCapture: 'None',
      DataShape: {
        data: { keyCount: 3, totalBytes: 2003010, keys: { small: 10, medium: 3000, large: 2000000 } },
        templateData: { keyCount: 2, totalBytes: 5001, keys: { tiny: 1, big: 5000 } },
      },
    });
    expect(rowCells(fixture).map(([input, key, size]) => `${input}.${key} ${size}`)).toEqual([
      'data.large 1.9 MB',
      'data.medium 2.9 KB',
      'data.small 10 B',
      'templateData.big 4.9 KB',
      'templateData.tiny 1 B',
    ]);
  });

  it('formats sizes as B under 1024, KB under 1 MiB and MB above, with one decimal place', () => {
    const fixture = render({
      DataCapture: 'None',
      DataShape: {
        data: {
          keyCount: 5,
          totalBytes: 2625023,
          keys: { underKb: 1023, oneKb: 1024, kbAndHalf: 1536, oneMb: 1048576, mbAndHalf: 1572864 },
        },
      },
    });
    const sizeByKey = Object.fromEntries(rowCells(fixture).map(([, key, size]) => [key, size]));
    expect(sizeByKey).toEqual({ underKb: '1023 B', oneKb: '1.0 KB', kbAndHalf: '1.5 KB', oneMb: '1.0 MB', mbAndHalf: '1.5 MB' });
  });

  it('shows "not serializable" for a key whose value could not be serialized', () => {
    const fixture = render({
      DataCapture: 'None',
      DataShape: { data: { keyCount: 2, totalBytes: 5, keys: { circular: -1, name: 5 } } },
    });
    expect(rowCells(fixture)).toEqual([
      ['data', 'name', '5 B'],
      ['data', 'circular', 'not serializable'],
    ]);
  });

  it.each([
    {
      elided: 'data',
      shape: {
        data: { keyCount: 40, totalBytes: 41000, keys: generatedKeys('d', 25), keysElided: true },
        templateData: { keyCount: 2, totalBytes: 300, keys: generatedKeys('t', 2), keysElided: false },
      },
      expected: ['Showing the 25 largest of 40 keys in data.'],
    },
    {
      elided: 'templateData',
      shape: {
        data: { keyCount: 2, totalBytes: 300, keys: generatedKeys('d', 2) },
        templateData: { keyCount: 30, totalBytes: 36000, keys: generatedKeys('t', 25), keysElided: true },
      },
      expected: ['Showing the 25 largest of 30 keys in templateData.'],
    },
  ])('adds a notice with the key count only for elided $elided', ({ shape, expected }) => {
    const fixture = render({ DataCapture: 'None', DataShape: shape });
    expect(notices(fixture)).toEqual(expected);
  });

  it('renders one row per listed key, not per key count, so no other shape content appears', () => {
    const fixture = render({
      DataCapture: 'None',
      DataShape: {
        data: { keyCount: 40, totalBytes: 41000, keys: generatedKeys('d', 25), keysElided: true },
        templateData: { keyCount: 2, totalBytes: 300, keys: generatedKeys('t', 2) },
      },
    });
    expect(QueryAll(fixture, 'tbody tr').length).toBe(27);
  });

  it('skips keys whose size is not a number and ignores an entry without a keys map', () => {
    // Parsed the way stored Messages JSON is: nothing checks the inner shape.
    const shape: TemplateDataShape = JSON.parse(
      '{"data":{"keyCount":4,"totalBytes":7,"keys":{"good":7,"text":"big","empty":null,"nested":{"a":1}}},' +
        '"templateData":{"keyCount":30,"totalBytes":900,"keysElided":true}}',
    );
    const fixture = render({ DataCapture: 'None', DataShape: shape });
    expect(Text(fixture, '.data-capture-message')).toBe(NONE_MESSAGE);
    expect(rowCells(fixture)).toEqual([['data', 'good', '7 B']]);
    expect(notices(fixture)).toEqual([]);
  });

  it.each([
    ['a string', '{"data":"oops"}'],
    ['an array', '{"data":[1,2,3]}'],
    ['an object with null keys', '{"data":{"keyCount":1,"keys":null}}'],
    ['an object with array keys', '{"data":{"keyCount":2,"keys":[5,6]}}'],
    ['an object with string keys', '{"data":{"keyCount":1,"keys":"abc"}}'],
  ])('treats a data entry that is %s as absent', (_label, json) => {
    const shape: TemplateDataShape = JSON.parse(json);
    const fixture = render({ DataCapture: 'None', DataShape: shape });
    expect(Text(fixture, '.data-capture-message')).toBe(NONE_MESSAGE);
    expect(Query(fixture, 'table')).toBeNull();
  });
});
