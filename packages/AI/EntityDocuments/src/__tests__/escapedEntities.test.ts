/**
 * `ESCAPED_ENTITIES` is how text stored by an escaping render is found and re-rendered raw. It must list exactly the
 * entities the real escaping render writes: a missing one leaves some escaped documents un-healed, an extra one
 * re-renders documents for nothing. Every printable ASCII character is rendered both ways through the real engine.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { TemplateEngineServer } from '@memberjunction/templates';
import { EntityDocumentTemplateParserBase } from '../generic/EntityDocumentTemplateParserBase';

/** Each printable ASCII character with what the escaping and the raw render make of it. */
async function renderEachCharacter(): Promise<{ Character: string; Escaped: string; Raw: string }[]> {
  const engine = TemplateEngineServer.Instance;
  engine.SetupNunjucks();
  const rows: { Character: string; Escaped: string; Raw: string }[] = [];
  for (let code = 32; code <= 126; code++) {
    const character = String.fromCharCode(code);
    const escaped = await engine.RenderTemplateSimple('{{ v }}', { v: character });
    const raw = await engine.RenderTemplateSimple('{{ v }}', { v: character }, { autoescape: false });
    rows.push({ Character: character, Escaped: escaped.Output ?? '', Raw: raw.Output ?? '' });
  }
  return rows;
}

describe('EntityDocumentTemplateParserBase.ESCAPED_ENTITIES', () => {
  let rows: { Character: string; Escaped: string; Raw: string }[];

  beforeAll(async () => {
    rows = await renderEachCharacter();
  });

  it('lists exactly the entities the escaping render writes', () => {
    const written = rows.filter((row) => row.Escaped !== row.Raw).map((row) => row.Escaped);
    expect([...written].sort()).toEqual([...EntityDocumentTemplateParserBase.ESCAPED_ENTITIES].sort());
  });

  it('never matches what the raw render writes', () => {
    for (const row of rows) {
      for (const entity of EntityDocumentTemplateParserBase.ESCAPED_ENTITIES) {
        expect(row.Raw).not.toContain(entity);
      }
    }
  });
});
