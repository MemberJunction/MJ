import { describe, it, expect } from 'vitest';
import vm from 'node:vm';
import {
  BuildRowTypeHints,
  WithRowTypeHints,
  CreateRunViewResultNormalizer,
  ROW_TYPE_HINTS_KEY,
  type RowTypeHintEntity,
  type HintedRunViewResult,
  type RunViewResultNormalizer,
} from '../../lib/row-type-shaping';

const ENTITIES: RowTypeHintEntity[] = [{
  Name: 'Email Sends',
  Fields: [
    { Name: 'ID', Type: 'uniqueidentifier' },
    { Name: 'SentDate', Type: 'datetimeoffset' },
    { Name: 'OpenCount', Type: 'int' },
    { Name: 'Subject', Type: 'nvarchar' },
    { Name: 'Is Bounced', CodeName: 'IsBounced', Type: 'bit' },
    { Name: 'Click Rate', CodeName: 'ClickRate', Type: 'decimal' },
    // TSType wins over Type, as on EntityFieldInfo.
    { Name: 'Score', Type: 'nvarchar', TSType: 'number' },
  ],
}];

describe('BuildRowTypeHints', () => {
  it('names date and number fields, under Name and a differing CodeName', () => {
    const hints = BuildRowTypeHints(ENTITIES, { EntityName: 'Email Sends' });
    expect(hints).toEqual({
      DateKeys: ['SentDate'],
      NumberKeys: ['OpenCount', 'Click Rate', 'ClickRate', 'Score'],
      CodeNames: { IsBounced: 'Is Bounced', ClickRate: 'Click Rate' },
    });
  });

  it('matches the entity name case-insensitively and ignores surrounding space', () => {
    expect(BuildRowTypeHints(ENTITIES, { EntityName: '  email sends ' })?.DateKeys).toEqual(['SentDate']);
  });

  it('returns null without an entity name or for an unknown entity', () => {
    expect(BuildRowTypeHints(ENTITIES, {})).toBeNull();
    expect(BuildRowTypeHints(ENTITIES, { EntityName: 'Nope' })).toBeNull();
    expect(BuildRowTypeHints(undefined, { EntityName: 'Email Sends' })).toBeNull();
  });
});

describe('WithRowTypeHints', () => {
  const ok = { Success: true, Results: [{ SentDate: '2026-09-01T00:00:00Z' }] };

  it('returns a copy carrying the hints and leaves the original untouched', () => {
    const hinted = WithRowTypeHints(ok, ENTITIES, { EntityName: 'Email Sends' });
    expect(hinted).not.toBe(ok);
    expect((hinted as HintedRunViewResult)[ROW_TYPE_HINTS_KEY]?.DateKeys).toEqual(['SentDate']);
    expect(ROW_TYPE_HINTS_KEY in ok).toBe(false);
  });

  it('passes failed, count-only and unresolvable results through unchanged', () => {
    const failed = { Success: false, Results: [] };
    expect(WithRowTypeHints(failed, ENTITIES, { EntityName: 'Email Sends' })).toBe(failed);
    expect(WithRowTypeHints(ok, ENTITIES, { EntityName: 'Email Sends', ResultType: 'count_only' })).toBe(ok);
    expect(WithRowTypeHints(ok, ENTITIES, { EntityName: 'Nope' })).toBe(ok);
  });
});

/** The normalizer as the page gets it: built from its source in a context with nothing else in scope. */
function pageNormalizer(): RunViewResultNormalizer {
  const source = `(${CreateRunViewResultNormalizer.toString()})(${JSON.stringify(ROW_TYPE_HINTS_KEY)})`;
  return vm.runInNewContext(source) as RunViewResultNormalizer;
}

function hintedResult(rows: Array<Record<string, unknown>>): HintedRunViewResult {
  return WithRowTypeHints({ Success: true, Results: rows }, ENTITIES, { EntityName: 'Email Sends' });
}

describe('CreateRunViewResultNormalizer: simple rows', () => {
  const normalize = CreateRunViewResultNormalizer(ROW_TYPE_HINTS_KEY);

  it('converts date and numeric cells and removes the hints', () => {
    const result = normalize({ EntityName: 'Email Sends' }, hintedResult([
      { SentDate: '2026-09-01T12:00:00Z', OpenCount: '7', 'Click Rate': '0.25', Subject: '42' },
    ]));
    const row = result?.Results?.[0] ?? {};
    expect(row.SentDate).toBeInstanceOf(Date);
    expect((row.SentDate as Date).toISOString()).toBe('2026-09-01T12:00:00.000Z');
    expect(row.OpenCount).toBe(7);
    expect(row['Click Rate']).toBe(0.25);
    expect(row.Subject).toBe('42'); // not a numeric field
    expect(result && ROW_TYPE_HINTS_KEY in result).toBe(false);
  });

  it('leaves NULLs, unparseable values and unsafe-range integers as they are', () => {
    const result = normalize({ EntityName: 'Email Sends' }, hintedResult([
      { SentDate: null, OpenCount: '9007199254740993' },
      { SentDate: 'not a date', OpenCount: '' },
    ]));
    expect(result?.Results).toEqual([
      { SentDate: null, OpenCount: '9007199254740993' },
      { SentDate: 'not a date', OpenCount: '' },
    ]);
  });

  it('leaves a failed result and a result without hints alone', () => {
    const failed = { Success: false, Results: [] };
    expect(normalize({}, failed)).toEqual({ Success: false, Results: [] });
    const unhinted = { Success: true, Results: [{ SentDate: '2026-09-01' }] };
    expect(normalize({}, unhinted)?.Results?.[0].SentDate).toBe('2026-09-01');
  });
});

describe('CreateRunViewResultNormalizer: entity_object rows', () => {
  const normalize = CreateRunViewResultNormalizer(ROW_TYPE_HINTS_KEY);
  const params = { EntityName: 'Email Sends', ResultType: 'entity_object' };
  const entityRow = () => normalize(params, hintedResult([
    { ID: 'a', SentDate: '2026-09-01T00:00:00Z', 'Is Bounced': false, Subject: 'Hi' },
  ]))?.Results?.[0] as Record<string, unknown> & {
    Get(name: string): unknown; Set(name: string, value: unknown): void; GetAll(): Record<string, unknown>;
  };

  it('reads fields through prototype getters, by Name and by CodeName', () => {
    const row = entityRow();
    expect(row.Subject).toBe('Hi');
    expect(row.SentDate).toBeInstanceOf(Date);
    expect(row.IsBounced).toBe(false);
    expect(row.Get('subject')).toBe('Hi');
  });

  it('has no own properties, so spreading or serializing loses the fields as with a BaseEntity', () => {
    const row = entityRow();
    expect(Object.keys(row)).toEqual([]);
    expect({ ...row }).toEqual({});
    expect(JSON.stringify(row)).toBe('{}');
    expect(row.GetAll()).toMatchObject({ ID: 'a', Subject: 'Hi' });
  });

  it('writes through Set and through the setter', () => {
    const row = entityRow();
    row.Set('Subject', 'Changed');
    expect(row.Subject).toBe('Changed');
    row.Subject = 'Again';
    expect(row.Get('Subject')).toBe('Again');
  });
});

describe('CreateRunViewResultNormalizer as injected into the page', () => {
  it('runs from its source alone, with nothing from this module in scope', () => {
    const normalize = pageNormalizer();
    const result = normalize({ EntityName: 'Email Sends', ResultType: 'entity_object' }, hintedResult([
      { OpenCount: '3', Subject: 'Hi' },
    ]));
    const row = result?.Results?.[0] ?? {};
    expect(row.OpenCount).toBe(3);
    expect(Object.keys(row)).toEqual([]);
  });
});
