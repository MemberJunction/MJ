/**
 * Embedding-document templating — `$` in resolved values (issue #3171).
 *
 * `Parse` resolves every `${...}` placeholder to a field value or function
 * result, then substitutes it into the template. That resolved value is record
 * data, so as a *string* replacement `$$`, `$&`, `` $` `` and `$'` inside it were
 * expanded rather than inserted — corrupting the text that gets embedded, and in
 * the `$&`/`` $` ``/`$'` cases splicing the surrounding template into it. Since
 * the embedding is what search later matches against, the corruption is durable
 * and silent. This path shipped with no test.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { EntityDocumentTemplateParserBase } from '../generic/EntityDocumenTemplateParserBase';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';

/** `$` before an ordinary character is NOT special — that case must keep working. */
const HOSTILE = ['a$$b', 'a$&b', 'a$`b', "a$'b", 'a$1b', 'a$b', "x$&$`$'$$y"];

const ENTITY_ID = '11111111-1111-1111-1111-111111111111';

/**
 * Returns a fixed value for every placeholder, so the assertions describe the
 * SUBSTITUTION rather than the (separately tested) resolution step.
 */
class FixedValueParser extends EntityDocumentTemplateParserBase {
    constructor(private readonly value: string) {
        super();
    }

    protected override get ProviderToUse(): IMetadataProvider {
        return {
            Entities: [{ ID: ENTITY_ID, PrimaryKeys: [{ Name: 'ID' }] }],
        } as unknown as IMetadataProvider;
    }

    protected override async evalSingleArgument(): Promise<string> {
        return this.value;
    }
}

const parse = async (template: string, value: string): Promise<string> => {
    // The base class memoises resolved values across instances, keyed by field
    // name — without a reset each case would read the previous case's value.
    (EntityDocumentTemplateParserBase as unknown as { __cache: Record<string, string> }).__cache = {};
    const parser = new FixedValueParser(value);
    return parser.Parse(template, ENTITY_ID, { ID: 'rec-1' }, {} as UserInfo);
};

describe('EntityDocumentTemplateParserBase.Parse — $ in resolved values (#3171)', () => {
    beforeEach(() => {
        (EntityDocumentTemplateParserBase as unknown as { __cache: Record<string, string> }).__cache = {};
    });

    for (const value of HOSTILE) {
        it(`substitutes a resolved value containing ${JSON.stringify(value)} verbatim`, async () => {
            expect(await parse('before ${Name} after', value)).toBe(`before ${value} after`);
        });
    }

    it('substitutes several placeholders without cross-contamination', async () => {
        expect(await parse('[${A}]-[${B}]', 'v$&v')).toBe('[v$&v]-[v$&v]');
    });

    it('leaves a template with no placeholders untouched', async () => {
        expect(await parse('plain $& text', 'unused')).toBe('plain $& text');
    });
});
