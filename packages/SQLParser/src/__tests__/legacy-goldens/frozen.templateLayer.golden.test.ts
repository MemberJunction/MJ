/**
 * FROZEN legacy goldens: the MJ template-layer pair Skip uses as a unit, and the token stream.
 *
 * Methods: Analyze, Substitute, Tokenize.
 *
 * Analyze and Substitute are legacy-kept (COMPAT-MAP §1.2: Skip gates `Substitute` on
 * `Analyze().hasMJExtensions`, and `Substitute().cleanSQL` must equal `Astify().cleanSQL`).
 * Tokenize's `MJToken` shape and offsets are spliced by Skip DE v2 (composition-arguments.ts).
 * IMPLEMENTATION-PLAN §2.1 freezes all three: output must stay byte-identical until 7.0. If the
 * comment-inert rule is ever wanted for Tokenize, it goes behind a new name, not into this output.
 *
 * Stored as SHA-256 hashes per entry (`<set>/FrozenTemplateLayer.sha256.json`); a mismatch prints
 * the entry Id and its full actual output.
 */
import { describe, it } from 'vitest';
import { SQLParser } from '../../sql-parser.js';
import { ExpectHashGolden, GoldenSets } from './harness.js';
import type { GoldenMethod } from './harness.js';

const METHODS: GoldenMethod[] = [
    { Name: 'Analyze', Run: e => SQLParser.Analyze(e.SQL) },
    { Name: 'Substitute', Run: e => SQLParser.Substitute(e.SQL) },
    { Name: 'Tokenize', Run: e => SQLParser.Tokenize(e.SQL) },
];

describe.each(GoldenSets())('frozen template-layer goldens ($Name corpus)', set => {
    it('Analyze, Substitute, Tokenize are unchanged', async () => {
        await ExpectHashGolden(set, 'FrozenTemplateLayer', METHODS);
    });
});
